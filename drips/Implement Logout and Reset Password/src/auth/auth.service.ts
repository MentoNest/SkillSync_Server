import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { TokenBlacklistService } from "./token-blacklist.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  async logout(token: string, userId: string): Promise<void> {
    if (!token) {
      throw new UnauthorizedException("No token provided");
    }

    try {
      const decoded = this.jwtService.verify(token);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

      // Add token to blacklist with remaining TTL
      await this.tokenBlacklistService.blacklistToken(token, expiresIn);

      // Optionally: invalidate all user sessions
      // await this.tokenBlacklistService.invalidateUserSessions(userId);
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }

  async validateToken(token: string): Promise<boolean> {
    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
    return !isBlacklisted;
  }
}
