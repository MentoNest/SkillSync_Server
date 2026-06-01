import { Body, Controller, Post } from '@nestjs/common';
import { JwtAuthService } from './jwt.service';

class IssueTokenDto {
  userId: string;
  wallet: string;
  roles?: string[];
  permissions?: string[];
}

@Controller('auth')
export class AuthController {
  constructor(private readonly jwtService: JwtAuthService) {}

  @Post('token')
  async issue(@Body() dto: IssueTokenDto) {
    const { accessToken, expiresIn, jti } =
      await this.jwtService.generateAccessToken({
        userId: dto.userId,
        wallet: dto.wallet,
        roles: dto.roles,
        permissions: dto.permissions,
      });

    return { accessToken, expiresIn, jti };
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
import { NonceProvider } from './providers/nonce.provider';
import { NonceParamDto } from './dto/nonce-param.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly nonceProvider: NonceProvider,
  ) {}

  @Get('nonce/:walletAddress')
  async generateNonce(@Param() params: NonceParamDto) {
    return this.nonceProvider.generate(params.walletAddress);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() request: Request) {
    await this.nonceProvider.enforceLoginRateLimit(body.walletAddress);

    const nonceValid = await this.nonceProvider.verifyAndConsume(
      body.walletAddress,
      body.nonce,
    );

    if (!nonceValid) {
      await this.authService.logLoginFailure(
        body.walletAddress,
        {
          ipAddress: this.getIpAddress(request),
          userAgent: request.headers['user-agent'] ?? null,
          deviceFingerprint: this.getDeviceFingerprint(request),
        },
        'Invalid or expired nonce',
      );
      throw new UnauthorizedException('Invalid or expired nonce');
    }

    return this.authService.loginWithSignature(
      body.walletAddress,
      body.nonce,
      body.signature,
      {
        ipAddress: this.getIpAddress(request),
        userAgent: request.headers['user-agent'] ?? null,
        deviceFingerprint: this.getDeviceFingerprint(request),
      },
    );
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

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@Req() request: Request) {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const accessToken = authHeader.slice(7);
    const user = (request as Request & { user?: JwtPayload }).user;

    if (!user?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    await this.authService.logoutUser(accessToken, user.sub, {
      ipAddress: this.getIpAddress(request),
      userAgent: request.headers['user-agent'] ?? null,
      deviceFingerprint: this.getDeviceFingerprint(request),
    });

    return { message: 'Logout successful' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logoutAll(@Req() request: Request) {
    const user = (request as Request & { user?: JwtPayload }).user;

    if (!user?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return this.authService.logoutAllSessions(user.sub, {
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
