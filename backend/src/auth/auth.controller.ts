import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RequestNonceDto } from './dto/request-nonce.dto.js';
import { WalletLoginDto } from './dto/wallet-login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

/**
 * Auth controller: nonce-based wallet login, token refresh, logout.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Request a nonce for wallet-based login. */
  @Post('nonce')
  requestNonce(@Body() dto: RequestNonceDto) {
    return this.authService.requestNonce(dto.walletAddress);
  }

  /** Login with wallet signature, returns JWT tokens. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: WalletLoginDto) {
    return this.authService.login(dto.walletAddress, dto.nonce);
  }

  /** Refresh access token using a valid refresh token. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Logout — revoke the current access token. */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Request() req: { user?: { jti?: string } }) {
    this.authService.logout(req.user?.jti || '');
    return { message: 'Logged out successfully' };
  }

  /** Get current authenticated user info. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: { user?: Record<string, unknown> }) {
    return { user: req.user };
  }
}
