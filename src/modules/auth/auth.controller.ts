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
  Ip,
  Headers,
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
import { NonceService } from './providers/nonce.service';
import { NonceRequestDto } from './dto/nonce-request.dto';
import { LoginDto, RegisterDto } from './dto/create-auth.dto';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly nonceService: NonceService
  ) {}

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
  async refresh(
    @Body() body: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.refresh(body?.refreshToken, { ipAddress: ip, userAgent });
  }

  @Post('logout')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Logout user and revoke session' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async logout(
    @Body() body: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.logout(body?.refreshToken, { ipAddress: ip, userAgent });
  }

  @Post('login')
  @RateLimit(RateLimits.STRICT)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(loginDto, { ipAddress: ip, userAgent });
  }

  @Post('register')
  @RateLimit(RateLimits.STRICT)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.register(registerDto, { ipAddress: ip, userAgent });
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
  stellarLogin(@Req() req: Request) {
    return { user: req.user };
  }
}
