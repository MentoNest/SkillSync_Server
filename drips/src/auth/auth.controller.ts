import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UserService } from './services/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ListUsersResponseDto } from './dto/list-users-response.dto';
import { Controller, Get, UseGuards, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }
  
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Guard handles redirect to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req, @Res() res: Response) {
    const user = req.user;
    const { access_token, user: userPayload } = this.authService.issueToken(user);
    
    // Return JWT token and user info
    return res.json({
      access_token,
      user: userPayload,
    });

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.login(loginDto, ip, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.rotateRefreshToken(dto.refreshToken, ip, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.revokeRefreshToken(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Post('request-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request email verification' })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent if user exists',
  })
  async requestVerification(@Body() dto: RequestVerificationDto) {
    await this.authService.requestVerification(dto);
    return { message: 'Verification email sent' };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { message: 'Email verified successfully' };
  }

  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Reset email sent if user exists' })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(dto);
    return { message: 'Password reset email sent' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  // ========== TEMPORARY ADMIN-ONLY ENDPOINTS ==========

  @Post('admin/users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user (temporary admin endpoint for testing)',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or user already exists',
  })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.userService.createUser(
      createUserDto.email,
      createUserDto.password,
      createUserDto.roles,
      createUserDto.status,
      createUserDto.firstName,
      createUserDto.lastName,
    );
    return new UserResponseDto(user);
  }

  @Get('admin/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all users with pagination (temporary admin endpoint for testing)',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: ListUsersResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination parameters',
  })
  async listUsers(
    @Query() queryDto: ListUsersQueryDto,
  ): Promise<ListUsersResponseDto> {
    const { users, total, page, limit } = await this.userService.listUsers(
      queryDto.page,
      queryDto.limit,
    );

    const userDtos = users.map((user) => new UserResponseDto(user));
    return new ListUsersResponseDto(userDtos, total, page, limit);
  }
}
