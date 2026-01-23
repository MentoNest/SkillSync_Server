import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();
    // For now, just mock a user object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    request.user = request.user || { sub: 'mock-user-id', roles: ['mentor'] };
    return true;
  }
}
