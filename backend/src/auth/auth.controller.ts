import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestNonceDto } from './dto/request-nonce.dto';
import { WalletLoginDto } from './dto/wallet-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * #971: Auth controller with endpoints for nonce-based wallet authentication,
 * token refresh, and logout.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * #972: Request a nonce for wallet-based login.
   */
  @Post('nonce')
  requestNonce(@Body() dto: RequestNonceDto) {
    return this.authService.requestNonce(dto.walletAddress);
  }

  /**
   * #973-974: Login with wallet signature, returns JWT tokens.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: WalletLoginDto) {
    return this.authService.login(dto.walletAddress, dto.nonce);
  }

  /**
   * #975: Refresh access token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * #976: Logout — invalidate current session.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Request() req: { user?: { jti?: string } }) {
    this.authService.logout(req.user?.jti || '');
    return { message: 'Logged out successfully' };
  }

  /**
   * Verify current token is valid.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: { user?: Record<string, unknown> }) {
    return { user: req.user };
  }
}
