import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, Role } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Use after `JwtAuthGuard`. Routes without `@Roles()` are open to any authenticated user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.roles?.some((role) => required.includes(role))) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
