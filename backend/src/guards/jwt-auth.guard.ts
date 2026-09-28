import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/optional-auth.decorator.js';
import { TokenBlacklistService } from '../security/token-blacklist.service';
import { MetricsService } from '../metrics/metrics.service.js';

export interface JwtAuthGuardOptions {
  optional?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly isExplicitOptional?: boolean;

  constructor(
    @Optional() private readonly reflector?: Reflector,
    @Optional() private readonly jwtService?: JwtService,
    // #1317: Redis backed access token blacklist. Checked *before* the
    // signature is verified so a token revoked by logout is rejected even
    // though it is still cryptographically valid.
    @Optional() private readonly tokenBlacklist?: TokenBlacklistService,
    @Optional() options?: JwtAuthGuardOptions,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    this.isExplicitOptional = options?.optional;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check @Public() decorator
    const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Check @OptionalAuth() decorator or guard instance option
    const isOptional =
      this.isExplicitOptional ??
      this.reflector?.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ??
      false;

    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      if (isOptional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'No authorization token provided',
        code: 'token_missing',
        error: 'Unauthorized',
      });
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      if (isOptional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException({
        statusCode: 401,
        message:
          'Invalid authorization header format. Format must be Bearer <token>',
        code: 'invalid_token',
        error: 'Unauthorized',
      });
    }

    // #1317: consult the Redis blacklist before validating the token.
    if (
      this.tokenBlacklist &&
      (await this.tokenBlacklist.isTokenBlacklisted(token))
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Token has been revoked',
        code: 'token_revoked',
        error: 'Unauthorized',
      });
    }

    // Verify token signature and expiration
    if (!this.jwtService) {
      // Fallback if jwtService not injected (e.g. direct instance without DI)
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      // Attach decoded payload to request.user
      request.user = payload;
      return true;
    } catch (error: any) {
      this.metricsService?.incrementJwtFailures(
        error?.name === 'TokenExpiredError' ? 'expired' : 'invalid',
      );
      if (error?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Token has expired',
          code: 'token_expired',
          error: 'Unauthorized',
        });
      }

      if (isOptional) {
        request.user = null;
        return true;
      }

      throw new UnauthorizedException({
        statusCode: 401,
        message: error?.message || 'Invalid token',
        code: 'invalid_token',
        error: 'Unauthorized',
      });
    }
  }
}
