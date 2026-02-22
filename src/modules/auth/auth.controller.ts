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
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
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

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List active sessions for the current user (admins may specify userId)' })
  async listSessions(
    @Req() req: Request,
    @Query('userId') userId?: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    const requester = req.user as any;
    const targetUserId = userId && requester.role === UserRole.ADMIN ? userId : requester.sub;

    if (userId && requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.authService.listSessionsForUser(targetUserId, parseInt(page as string, 10), parseInt(perPage as string, 10));
  }

  @Post('sessions/:id/revoke')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke a specific session (owner or admin)' })
  async revokeSession(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('userId') userId?: string,
  ) {
    const requester = req.user as any;

    let targetUserId = requester.sub;

    if (userId) {
      // admin may specify userId
      if (requester.role !== UserRole.ADMIN) throw new ForbiddenException('Insufficient permissions');
      targetUserId = userId;
    } else {
      // ensure owner
      const sessions = await this.authService.listSessionsForUser(requester.sub);
      const owns = sessions.items.some((s: any) => s.id === id);
      if (!owns && requester.role !== UserRole.ADMIN) throw new ForbiddenException('Cannot revoke sessions of other users');
    }

    await this.authService.revokeSessionById(targetUserId, id);
    return { message: 'Session revoked' };
  }

  @Post('sessions/revoke-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke all sessions for the current user except current' })
  async revokeAll(@Req() req: Request) {
    const requester = req.user as any;
    const except = (requester as any).sid as string | undefined;
    await this.authService.revokeAllSessionsExcept(requester.sub, except);
    return { message: 'All other sessions revoked' };
  }
}

