import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { NonceDto } from './dto/nonce.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('nonce')
  @ApiTags('Wallet')
  @ApiOperation({ summary: 'Request a nonce for wallet signature', description: 'Returns a one-time nonce to be signed by the wallet. Expires in 5 minutes.' })
  @ApiBody({ type: NonceDto })
  @ApiResponse({ status: 201, description: 'Nonce generated', schema: { example: { nonce: 'uuid-nonce' } } })
  @ApiResponse({ status: 400, description: 'Invalid wallet address' })
  async generateNonce(@Body() nonceDto: NonceDto) {
    const nonce = await this.authService.generateNonce(nonceDto.walletAddress);
    return { nonce };
  }

  @Post('login')
  @ApiTags('Wallet')
  @ApiOperation({ summary: 'Authenticate with wallet signature', description: 'Verifies the signed nonce and returns JWT access + refresh tokens.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful', schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...', user: { id: 'uuid', walletAddress: 'G...', roles: ['mentee'] } } } })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Invalid nonce or signature' })
  async login(
    @Body() loginDto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') ipAddress?: string,
  ) {
    return this.authService.login(loginDto, userAgent, ipAddress);
  }

  @Post('refresh')
  @ApiTags('Session Management')
  @ApiOperation({ summary: 'Rotate refresh token', description: 'Exchanges a valid refresh token for a new access + refresh token pair (rotation).' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 201, description: 'Tokens refreshed', schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') ipAddress?: string,
  ) {
    return this.authService.refreshTokens(refreshDto, userAgent, ipAddress);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiTags('Session Management')
  @ApiOperation({ summary: 'Logout current session', description: 'Blacklists the access token and revokes all refresh tokens for the current session.' })
  @ApiResponse({ status: 201, description: 'Logout successful', schema: { example: { message: 'Logout successful' } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: any,
    @Headers('authorization') authorization: string,
  ) {
    const accessToken = authorization.replace('Bearer ', '');
    await this.authService.logout(accessToken, user.userId);
    return { message: 'Logout successful' };
  }

  @Post('revoke-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiTags('Session Management')
  @ApiOperation({ summary: 'Revoke all sessions', description: 'Invalidates all refresh tokens and increments token version, forcing re-authentication on all devices. Rate limited to 3 requests/hour.' })
  @ApiResponse({ status: 200, description: 'All sessions revoked', schema: { example: { message: 'All sessions revoked', revokedCount: 3 } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async revokeAll(@CurrentUser() user: any) {
    return this.authService.revokeAll(user.userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved', schema: { example: { id: 'uuid', walletAddress: 'G...', roles: ['mentee'], permissions: ['read:profile'] } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.userId);
  }

  @Post('admin/assign-role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign role to user (Admin only)' })
  @ApiBody({ schema: { example: { userId: 'uuid', roleName: 'mentor' } } })
  @ApiResponse({ status: 201, description: 'Role assigned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  async assignRole(
    @CurrentUser() user: any,
    @Body() body: { userId: string; roleName: string },
  ) {
    return this.authService.assignRole(user.userId, body.userId, body.roleName);
  }

  @Post('admin/revoke-role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke role from user (Admin only)' })
  @ApiBody({ schema: { example: { userId: 'uuid', roleName: 'mentor' } } })
  @ApiResponse({ status: 201, description: 'Role revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  async revokeRole(
    @CurrentUser() user: any,
    @Body() body: { userId: string; roleName: string },
  ) {
    return this.authService.revokeRole(user.userId, body.userId, body.roleName);
  }
}
