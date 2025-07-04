import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { AuthDto } from './dto/sign-in.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SignInResponseDto } from './dto/sign-in-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './providers/auth.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //ROUTE TO REGISTER A USER 
  @Post('signup')
  signup(@Body() dto: CreateUserDto) {
    return this.authService.signup(dto);
  }

  //ROUTE TO LOG-IN A USER
  @Post('signin')
  @ApiOperation({ summary: 'Sign in user ' })
  @ApiResponse({
    status: 200,
    description: 'User successfully authenticated',
    type: SignInResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  signin(@Body() dto: AuthDto) {
    return this.authService.signin(dto);
  }

  //ROUTE TO CHANGE PASSWORD 
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password updated successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Passwords do not match',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid current password',
  })
  public async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  //ROUTE TO LOG-OUT A USER 
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user and invalidate tokens' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Logout successful' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  public async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req.user.userId, res);
  }

  //ROUTE TO FORGOT PASSWORD
  @Post('forgot-password')
  public async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  //ROUTE TO RESET PASSWORD 
  @Post('reset-password')
  public async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password successfully reset.' };
  }
}
