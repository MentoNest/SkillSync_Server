import { Body, Controller, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, NonceRequestDto, RefreshDto } from './dto/auth.dto';
import { Public } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('nonce')
  @Public()
  @HttpCode(200)
  nonce(@Body() dto: NonceRequestDto) {
    return this.auth.requestNonce(dto.walletAddress);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent: string, @Ip() ipAddress: string) {
    return this.auth.login(dto, { userAgent, ipAddress });
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') userAgent: string, @Ip() ipAddress: string) {
    return this.auth.refreshTokens(dto.refreshToken, { userAgent, ipAddress });
  }
}
