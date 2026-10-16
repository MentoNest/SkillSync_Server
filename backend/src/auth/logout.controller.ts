import { Body, Controller, Headers, HttpCode, Ip, Post, Req } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { LogoutService } from './logout.service';

class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

interface AuthedRequest {
  user: { sub: string; jti: string; exp: number };
}

@Controller('auth')
export class LogoutController {
  constructor(private readonly logout: LogoutService) {}

  /** Requires the JWT auth guard (applied globally or by the auth PR) to populate request.user. */
  @Post('logout')
  @HttpCode(204)
  async handle(
    @Req() req: AuthedRequest,
    @Body() dto: LogoutDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ): Promise<void> {
    await this.logout.logout({
      userId: req.user.sub,
      jti: req.user.jti,
      exp: req.user.exp,
      refreshToken: dto.refreshToken,
      ipAddress,
      userAgent,
    });
  }
}
