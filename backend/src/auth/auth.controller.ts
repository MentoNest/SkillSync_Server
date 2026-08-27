import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Ip,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SuspiciousDetectionService } from './services/suspicious-detection.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { NonceResponseDto } from './dto/nonce-response.dto';
import { RevokeAllResponseDto } from './dto/revoke-all-response.dto';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../user/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { RevokeAllRateLimitGuard } from './guards/revoke-all-rate-limit.guard';
import { NonceRateLimitGuard } from './guards/nonce-rate-limit.guard';
import { WalletLoginRateLimitGuard } from './guards/wallet-login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly suspiciousDetectionService: SuspiciousDetectionService,
  ) {}

  // ---------------------------------------------------------------------------
  // Wallet Authentication Endpoints
  // ---------------------------------------------------------------------------
  @ApiTags('Wallet')
  @Get('nonce/:walletAddress')
  @UseGuards(NonceRateLimitGuard)
  @ApiOperation({
    summary: 'Request cryptographic nonce challenge for Stellar wallet signature (#1146)',
    description:
      'Generates a unique, one-time cryptographic nonce (256-bit, crypto.randomBytes(32)) for a given Stellar wallet address. The nonce is stored in Redis under nonce:{walletAddress} with a 5 minute TTL and must be signed with the wallet private key. Requesting a new nonce invalidates any previous unused nonce. Rate limited to 5 requests per minute per wallet.',
  })
  @ApiParam({
    name: 'walletAddress',
    description: '56-character Stellar Ed25519 public key (G-address)',
    example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nonce challenge generated successfully ({ nonce, expiresAt })',
    type: NonceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid Stellar wallet address format (must be a 56-character G-address)',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded (maximum 5 nonce requests per minute per wallet)',
  })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async getNonce(@Param('walletAddress') walletAddress: string): Promise<NonceResponseDto> {
    return this.authService.generateNonce(walletAddress);
  }

  // ---------------------------------------------------------------------------
  // Core Authentication Endpoints
  // ---------------------------------------------------------------------------
  @ApiTags('Authentication')
  @Post('login')
  @UseGuards(WalletLoginRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user with Stellar wallet signature or email credentials (#1147)',
    description:
      'Verifies a Stellar wallet signature over the previously issued nonce using the Stellar SDK (StrKey + Keypair.verify). The nonce is invalidated immediately after the verification attempt to prevent replay attacks. Successful login creates/retrieves the user account and returns access and refresh tokens. Every attempt is audit logged. Rate limited to 10 attempts per 15 minutes per wallet.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authentication successful. Returns JWT access and refresh tokens.',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Missing required credentials',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid signature, expired/missing nonce, or invalid email/password',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Account locked due to consecutive failed attempts or suspicious activity',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded (maximum 10 login attempts per 15 minutes per wallet)',
  })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.login(loginDto, ip, userAgent);
  }

  @ApiTags('Authentication')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token using a valid refresh token',
    description:
      'Validates the provided refresh token against active sessions database and issues a fresh JWT access token.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'New access token issued successfully',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        expiresIn: { type: 'number', example: 86400 },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Refresh token is missing or malformed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid, revoked, or expired refresh token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User account is locked or disabled',
  })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @ApiTags('Session Management')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout and invalidate current session',
    description: 'Invalidates the supplied refresh token, ending the active session.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string', example: 'd8e4f1a2-7b3c-4d5e-9f0a-1b2c3d4e5f6a' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged out successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Logged out successfully' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async logout(@Body('refreshToken') refreshToken?: string) {
    return this.authService.logout(refreshToken);
  }

  // ---------------------------------------------------------------------------
  // Session Management Endpoints (#1158)
  // ---------------------------------------------------------------------------
  @ApiTags('Session Management')
  @Post('revoke-all')
  @UseGuards(RolesGuard, RevokeAllRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Revoke all active sessions across all devices for the current user',
    description:
      'Invalidates and deletes all stored refresh tokens for the authenticated user and increments the tokenVersion, immediately invalidating all existing JWT access tokens. Action is logged in the audit log. Rate limited to 3 requests per hour.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All sessions successfully revoked',
    type: RevokeAllResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid Bearer authentication token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Invalid token version or locked account',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded (maximum 3 revoke-all requests per hour)',
  })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async revokeAll(
    @CurrentUser() user: User,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<RevokeAllResponseDto> {
    return this.authService.revokeAll(user.id, ip, userAgent);
  }

  @ApiTags('Session Management')
  @Post('admin/revoke-all/:userId')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Admin: Revoke all active sessions for a target user',
    description:
      'Allows an administrator to immediately invalidate all sessions and refresh tokens for any user account in the system.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Target user UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Target user sessions revoked successfully',
    type: RevokeAllResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication token missing or invalid',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin role permissions',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Target user not found' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async adminRevokeAll(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() adminUser: User,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<RevokeAllResponseDto> {
    return this.authService.adminRevokeAll(targetUserId, adminUser, ip, userAgent);
  }

  // ---------------------------------------------------------------------------
  // Security & Suspicious Activity Dashboard Endpoints (#1157)
  // ---------------------------------------------------------------------------
  @ApiTags('Security & Audit')
  @Get('admin/suspicious-activity')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Admin: Retrieve suspicious authentication and security audit logs',
    description:
      'Provides a security dashboard feed of all suspicious authentication events (abnormal IP changes, rapid geo jumps, brute force attempts) flagged by the detection engine.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({
    name: 'walletAddress',
    required: false,
    example: '0x71C841832047387195060979DC80EbbE62DCE35B',
    description: 'Filter logs by wallet address',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of suspicious audit log events',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin privileges required' })
  async getSuspiciousActivity(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('walletAddress') walletAddress?: string,
  ) {
    return this.suspiciousDetectionService.getSuspiciousActivityDashboard({
      page,
      limit,
      walletAddress,
    });
  }
}
