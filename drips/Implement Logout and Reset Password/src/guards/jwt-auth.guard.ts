import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TokenBlacklistService } from "../token-blacklist.service";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly tokenBlacklistService: TokenBlacklistService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, validate JWT signature and expiration
    const isValid = await super.canActivate(context);

    if (!isValid) {
      return false;
    }

    // Then check if token is blacklisted
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new UnauthorizedException("No token provided");
    }

    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);

    if (isBlacklisted) {
      throw new UnauthorizedException("Token has been revoked");
    }

    // Optionally check if user's all sessions were invalidated
    const user = request.user;
    if (user && user.iat) {
      const isSessionInvalidated =
        await this.tokenBlacklistService.isUserSessionInvalidated(
          user.userId,
          user.iat,
        );

      if (isSessionInvalidated) {
        throw new UnauthorizedException("Session has been invalidated");
      }
    }

    return true;
  }
}
