import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { NonceProvider } from '../providers/nonce.provider';
import { NonceResponseDto } from './dto/nonce-response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly nonceProvider: NonceProvider,
  ) {}

  @Get('nonce/:walletAddress')
  @ApiTags('Wallet')
  @ApiOperation({
    summary: 'Generate a nonce for wallet authentication',
    description:
      'Generates a one-time nonce tied to the given wallet address. ' +
      'The client must sign this nonce with their private key and submit ' +
      'it to POST /auth/login to obtain access and refresh tokens.',
  })
  @ApiParam({
    name: 'walletAddress',
    description: 'Stellar wallet public key (G... address)',
    example: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nonce generated successfully',
    type: NonceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid wallet address format',
  })
  async generateNonce(
    @Param('walletAddress') walletAddress: string,
  ): Promise<NonceResponseDto> {
    return this.nonceProvider.generate(walletAddress);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiTags('Session Management')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchanges a valid refresh token for a new access token and a ' +
      'rotated refresh token. The old refresh token is invalidated after use.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tokens refreshed successfully',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Refresh token is missing, invalid, or expired',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server error',
  })
  refresh(@Body() body: RefreshTokenDto, @Req() request: Request) {
    if (!body?.refreshToken || typeof body.refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    return this.authService.refresh(body.refreshToken, {
      ipAddress: this.getIpAddress(request),
      userAgent: request.headers['user-agent'] ?? null,
      deviceFingerprint: this.getDeviceFingerprint(request),
    });
  }

  private getIpAddress(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    return request.socket.remoteAddress ?? null;
  }

  private getDeviceFingerprint(request: Request): string | null {
    const header = request.headers['x-device-fingerprint'];
    return typeof header === 'string' && header.length > 0 ? header : null;
  }
}