import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
import { Get, Param } from '@nestjs/common';
import { NonceProvider } from './providers/nonce.provider';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly nonceProvider: NonceProvider,
  ) {}

  @Get('nonce/:walletAddress')
  async generateNonce(@Param('walletAddress') walletAddress: string) {
    return this.nonceProvider.generate(walletAddress);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() request: Request) {
    // TODO: Implement Stellar signature verification
    // For now, we'll trust the wallet address from the request
    return this.authService.login(body.walletAddress, {
      ipAddress: this.getIpAddress(request),
      userAgent: request.headers['user-agent'] ?? null,
      deviceFingerprint: this.getDeviceFingerprint(request),
    });
  }

  @Post('refresh')
  @HttpCode(200)
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
