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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { SessionRevokeService } from './services/session-revoke.service.js';
import { SuspiciousLoginService } from './services/suspicious-login.service.js';
import { RequestNonceDto } from './dto/request-nonce.dto.js';
import { WalletLoginDto } from './dto/wallet-login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { normalizeWalletAddress } from '../common/utils/wallet.utils.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

/**
 * #984-985: Auth controller with Swagger documentation and session management.
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionRevokeService: SessionRevokeService,
    private readonly suspiciousLoginService: SuspiciousLoginService,
  ) {}

  /**
   * #972 + #985: Request a nonce for wallet login.
   */
  @Post('nonce')
  @ApiOperation({
    summary: 'Request a nonce for wallet-based login',
    description:
      'Generates a time-limited nonce (5 minutes) that must be signed by the wallet to prove ownership.',
  })
  @ApiResponse({
    status: 200,
    description: 'Nonce generated successfully',
    schema: {
      example: { nonce: 'Sign this message...', expiresAt: 1700000000000 },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid wallet address format' })
  requestNonce(@Body() dto: RequestNonceDto) {
    const walletAddress = normalizeWalletAddress(dto.walletAddress);
    return this.authService.requestNonce(walletAddress);
  }

  /**
   * #973-974 + #983 + #985: Login with wallet signature.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with Stellar wallet signature',
    description:
      'Verifies wallet signature against the nonce and returns JWT tokens. Tracks failed attempts for suspicious login detection.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        accessToken: 'eyJhbGci...',
        refreshToken: 'eyJhbGci...',
        expiresIn: 900,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Invalid signature, expired nonce, or suspicious activity detected',
  })
  async login(@Body() dto: WalletLoginDto, @Request() req: { ip?: string }) {
    const walletAddress = normalizeWalletAddress(dto.walletAddress);
    const ipAddress = req.ip || 'unknown';

    // #983: Check for suspicious activity
    const suspicious = await this.suspiciousLoginService.recordFailedAttempt(
      walletAddress,
      ipAddress,
    );
    if (suspicious.isSuspicious && suspicious.shouldLock) {
      throw new BadRequestException({
        message: 'Account temporarily locked due to suspicious activity',
        code: 'account_locked',
        retryAfter: 1800,
      });
    }

    const result = await this.authService.login(walletAddress, dto.nonce);

    // Record successful login
    await this.suspiciousLoginService.recordSuccessfulLogin(
      walletAddress,
      ipAddress,
    );

    return result;
  }

  /**
   * #975 + #985: Refresh access token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchange a valid refresh token for a new access + refresh token pair. Old refresh token is revoked (rotation).',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed',
    schema: {
      example: {
        accessToken: 'eyJhbGci...',
        refreshToken: 'eyJhbGci...',
        expiresIn: 900,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * #976 + #985: Logout.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout and invalidate current session',
    description: 'Revokes the current access token and optional refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  logout(@Request() req: { user?: { jti?: string } }) {
    this.authService.logout(req.user?.jti || '');
    return { message: 'Logged out successfully' };
  }

  /**
   * #984 + #985: Revoke all sessions.
   */
  @Post('revoke-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke all active sessions',
    description:
      'Invalidates all refresh tokens and access tokens for the authenticated user. Essential for security when a device is lost or compromised.',
  })
  @ApiResponse({
    status: 200,
    description: 'All sessions revoked',
    schema: {
      example: {
        revokedCount: 3,
        walletAddress: 'GABC...',
        timestamp: 1700000000000,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async revokeAll(
    @Request() req: { user?: { wallet?: string; sub?: string } },
  ) {
    const walletAddress = normalizeWalletAddress(
      req.user?.wallet || req.user?.sub || '',
    );
    return this.sessionRevokeService.revokeAllSessions(
      walletAddress,
      walletAddress,
    );
  }

  /**
   * #985: Get current user info.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current authenticated user',
    description: 'Returns the decoded JWT payload for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'User info returned' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  me(@Request() req: { user?: Record<string, unknown> }) {
    return { user: req.user };
  }

  /**
   * #983: Suspicious activity summary (admin).
   */
  @Get('suspicious/:wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get suspicious activity summary (admin)',
    description:
      'Returns failed login attempts, known IPs, and lockdown status for a wallet.',
  })
  @ApiParam({
    name: 'wallet',
    description: 'Stellar wallet address (G...)',
    example: 'GABC123...',
  })
  @ApiResponse({ status: 200, description: 'Suspicious activity summary' })
  async getSuspiciousActivity(@Param('wallet') wallet: string) {
    const walletAddress = normalizeWalletAddress(wallet);
    return this.suspiciousLoginService.getSuspiciousActivitySummary(
      walletAddress,
    );
  }
}
