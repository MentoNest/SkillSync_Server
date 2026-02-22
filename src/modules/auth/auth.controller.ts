import {
  Controller,
  Get,
  Body,
  HttpStatus,
  UseGuards,
  Query,
  HttpException,
  Post,
  Req,
  Delete,
  Patch,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './providers/auth.service';
import { NonceResponseDto } from './dto/nonce-response.dto';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit, RateLimits } from '../../common/decorators/rate-limit.decorator';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { STELLAR_STRATEGY } from './strategies/stellar.strategy';
import { AuthGuard } from '@nestjs/passport';
import { CreateStellarAuthDto } from './dto/create-stellar-auth.dto';
import type { Request } from 'express';
import { NonceRequestDto } from './dto/nonce-request.dto';
import { StellarNonceService } from './providers/nonce.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { User } from '../user/entities/user.entity';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly nonceService: StellarNonceService
  ) { }

  @Get('nonce')
  @ApiOperation({ summary: 'Generate a nonce for authentication' })
  @ApiResponse({
    status: 200,
    description: 'Returns a cryptographically secure nonce',
    type: NonceResponseDto,
  })
  @RateLimit(RateLimits.STRICT) // Strict rate limiting for nonce generation
  async generateNonce(): Promise<NonceResponseDto> {
    return this.authService.generateNonce();
  }

  @Get('nonce/validate')
  @RateLimit(RateLimits.NORMAL) // Normal rate limiting for validation
  async validateNonce(@Query('nonce') nonce: string) {
    if (!nonce) {
      throw new HttpException('Nonce parameter is required', HttpStatus.BAD_REQUEST);
    }

    const isValid = await this.authService.validateNonce(nonce);
    return {
      nonce: nonce.substring(0, 8) + '...',
      valid: isValid,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  @Post('refresh')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new token pair' })
  @ApiResponse({ status: 200, description: 'Returns a new access/refresh token pair' })
  @ApiResponse({ status: 401, description: 'Invalid, reused, or revoked refresh token' })
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body?.refreshToken);
  }

  @Post('nonce')
  @ApiOperation({ summary: 'Request a nonce to sign for Stellar wallet authentication' })
  @ApiBody({ type: NonceRequestDto })
  @ApiResponse({ status: 201, type: NonceResponseDto })
  nonce(@Body() dto: NonceRequestDto): NonceResponseDto {
    return this.nonceService.issue(dto.publicKey);
  }

  @Post('login/stellar')
  @UseGuards(AuthGuard(STELLAR_STRATEGY))
  @ApiOperation({ summary: 'Authenticate using a signed Stellar nonce' })
  @ApiBody({ type: CreateStellarAuthDto })
  @ApiResponse({ status: 200, description: 'Authenticated user context' })
  @ApiResponse({ status: 401, description: 'Invalid signature or nonce' })
  login(@Req() req: Request) {
    return { user: req.user };
  }

  @Post('wallets/link')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Link a new Stellar wallet to the account' })
  @ApiBody({ type: LinkWalletDto })
  @ApiResponse({ status: 201, description: 'Wallet linked successfully' })
  async linkWallet(@Req() req: Request, @Body() dto: LinkWalletDto) {
    const user = req.user as User;
    return this.authService.linkWallet(user.id, dto);
  }

  @Delete('wallets/:address')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a linked Stellar wallet' })
  @ApiBody({ type: LinkWalletDto, description: 'Requires signature verification for removal' })
  @ApiResponse({ status: 200, description: 'Wallet removed successfully' })
  async removeWallet(
    @Req() req: Request,
    @Param('address') address: string,
    @Body() dto: LinkWalletDto,
  ) {
    const user = req.user as User;
    return this.authService.removeWallet(user.id, address, dto);
  }

  @Patch('wallets/:address/primary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set a wallet as the primary wallet' })
  @ApiResponse({ status: 200, description: 'Primary wallet updated successfully' })
  async setPrimaryWallet(@Req() req: Request, @Param('address') address: string) {
    const user = req.user as User;
    return this.authService.setPrimaryWallet(user.id, address);
  }
}

