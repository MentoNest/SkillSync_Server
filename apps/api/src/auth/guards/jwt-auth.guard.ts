import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // For now, just mock a user object
    request.user = request.user || { sub: 'mock-user-id', roles: ['mentor'] };
    return true;
  }
}
