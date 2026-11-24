import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  InternalServerErrorResponseDto,
  TooManyRequestsResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import {
  LoginDto,
  IssuedNonceResponseDto,
  NonceAddressParamsDto,
  NonceDto,
  NonceResponseDto,
  RefreshDto,
  SessionRevocationResponseDto,
  TokenPairResponseDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { WalletAuthGuard } from './guards/wallet-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ─── Wallet ─────────────────────────────────────────────────────────────────

  @ApiTags('Wallet')
  @ApiOperation({
    summary: 'Request a wallet login nonce',
    description:
      'Issues a cryptographically secure, single-use nonce tied to the given Stellar wallet address. ' +
      'The nonce expires after 5 minutes and replaces any previous unused nonce for this wallet.',
    operationId: 'requestWalletNonce',
  })
  @ApiParam({ name: 'walletAddress', description: 'Stellar wallet public key (ED25519).' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nonce issued successfully.',
    type: IssuedNonceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Wallet address is not a valid Stellar public key.',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Get('nonce/:walletAddress')
  nonceForWallet(@Param() params: NonceAddressParamsDto): Promise<IssuedNonceResponseDto> {
    return this.auth.createNonceWithExpiry(params.walletAddress);
  }

  @ApiTags('Wallet')
  @ApiOperation({
    summary: 'Request a login nonce',
    description:
      'Issues a single-use nonce tied to the given Stellar wallet address. ' +
      'The response includes the exact UTF-8 message the wallet must sign with its ED25519 private key. ' +
      'The nonce expires after 5 minutes (configurable) and is consumed on the first login attempt, ' +
      'whether or not the signature is valid.',
    operationId: 'requestNonce',
  })
  @ApiBody({ type: NonceDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nonce issued successfully.',
    type: NonceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Request body failed validation (e.g. address is not a valid Stellar public key).',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Post('nonce')
  @HttpCode(HttpStatus.OK)
  nonce(@Body() dto: NonceDto): Promise<NonceResponseDto> {
    return this.auth.createNonce(dto.address);
  }

  // ─── Authentication ──────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Log in with a wallet signature',
    description:
      'Authenticates a Stellar wallet by verifying the ED25519 signature over the nonce message ' +
      'returned by POST /auth/nonce. On success, issues an access/refresh token pair. ' +
      'The nonce is consumed regardless of outcome and cannot be reused.',
    operationId: 'login',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authentication successful. Returns a short-lived access token and a single-use refresh token.',
    type: TokenPairResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Request body failed validation.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Signature is invalid, the nonce has already been used, or no nonce exists for this address.',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WalletAuthGuard)
  login(@Body() _dto: LoginDto, @CurrentUser() user: AuthUser): Promise<TokenPairResponseDto> {
    return this.auth.issueForUser(user);
  }

  // ─── Session Management ──────────────────────────────────────────────────────

  @ApiTags('Session Management')
  @ApiOperation({
    summary: 'Rotate tokens',
    description:
      'Exchanges a valid refresh token for a new access/refresh token pair. ' +
      'The presented refresh token is immediately invalidated (single-use rotation), ' +
      'so concurrent refresh calls with the same token will result in one success and one 401.',
    operationId: 'refreshTokens',
  })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token pair rotated successfully.',
    type: TokenPairResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'refreshToken is not a valid JWT string.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Refresh token is expired, has already been used, or was issued for a different token type.',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenPairResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiTags('Session Management')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the caller\'s current access token by adding its JTI to the blacklist, and ' +
      'optionally invalidates the accompanying refresh token if supplied in the body. ' +
      'Requires a valid Bearer access token in the Authorization header.',
    operationId: 'logout',
  })
  @ApiBody({ type: RefreshDto, required: false, description: 'Optionally supply the refresh token to invalidate it immediately.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Logged out successfully. No response body.' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Access token is missing, expired, or already revoked.',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient role.', type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() body: Partial<RefreshDto>,
  ): Promise<void> {
    await this.auth.logout(user, body?.refreshToken);
  }

  @ApiTags('Session Management')
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Revoke all of the caller’s sessions',
    description:
      'Invalidates every active refresh token for the authenticated user and increments their token version, ' +
      'which invalidates all previously issued access and refresh tokens.',
    operationId: 'revokeAllSessions',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All active sessions were revoked.',
    type: SessionRevocationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Access token is missing, expired, or already revoked.',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Post('revoke-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async revokeAllSessions(@CurrentUser() user: AuthUser): Promise<SessionRevocationResponseDto> {
    const revokedCount = await this.auth.revokeAllSessions(user);
    return { message: 'All active sessions have been revoked.', revokedCount };
  }

  @ApiTags('Session Management')
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Revoke all sessions for a user (admin)',
    description: 'Invalidates every active session for the specified wallet address. Requires the admin role.',
    operationId: 'adminRevokeAllSessions',
  })
  @ApiParam({ name: 'walletAddress', description: 'Stellar wallet address whose sessions will be revoked.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All active sessions were revoked.',
    type: SessionRevocationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Access token is missing, expired, or already revoked.',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient role.', type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Post('admin/revoke-all/:walletAddress')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async adminRevokeAllSessions(
    @CurrentUser() actor: AuthUser,
    @Param() params: NonceAddressParamsDto,
  ): Promise<SessionRevocationResponseDto> {
    const revokedCount = await this.auth.adminRevokeAllSessions(actor, params.walletAddress);
    return { message: 'All active sessions have been revoked.', revokedCount };
  }
}
