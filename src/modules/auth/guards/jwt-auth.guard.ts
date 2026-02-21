import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * JWT Authentication Guard
 * Protects routes by requiring a valid JWT token
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Add custom authentication logic here if needed
    // For example: check if route is public, log access attempts, etc.
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      const error = err instanceof Error ? err : new Error('Authentication error');
      throw error instanceof Error
        ? error
        : new UnauthorizedException('Invalid or missing authentication token');
    }
    return user;
  }
}
