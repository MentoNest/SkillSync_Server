import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto, NonceDto, RefreshDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { WalletAuthGuard } from './guards/wallet-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('nonce')
  @HttpCode(200)
  nonce(@Body() dto: NonceDto) {
    return this.auth.createNonce(dto.address);
  }

  /** The wallet guard verifies the signature (consuming the nonce); the DTO validates the body shape. */
  @Post('login')
  @HttpCode(200)
  @UseGuards(WalletAuthGuard)
  login(@Body() _dto: LoginDto, @CurrentUser() user: AuthUser) {
    return this.auth.issueForUser(user);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthUser, @Body() body: Partial<RefreshDto>) {
    await this.auth.logout(user, body?.refreshToken);
  }
}
