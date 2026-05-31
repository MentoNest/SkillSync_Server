import { Body, Controller, Post } from '@nestjs/common';
import { JwtAuthService } from './jwt.service';

class IssueTokenDto {
  userId: string;
  wallet: string;
  roles?: string[];
  permissions?: string[];
}

@Controller('auth')
export class AuthController {
  constructor(private readonly jwtService: JwtAuthService) {}

  @Post('token')
  async issue(@Body() dto: IssueTokenDto) {
    const { accessToken, expiresIn, jti } =
      await this.jwtService.generateAccessToken({
        userId: dto.userId,
        wallet: dto.wallet,
        roles: dto.roles,
        permissions: dto.permissions,
      });

    return { accessToken, expiresIn, jti };
  }
}
