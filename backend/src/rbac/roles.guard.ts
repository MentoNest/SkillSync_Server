import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from './roles.decorator';

interface JwtUser {
  roles?: string[];
  permissions?: string[];
}

/** Runs after the JWT auth guard, which must have set `request.user` from the token claims. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    const perms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (!roles?.length && !perms?.length) return true;

    const user: JwtUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Not authenticated');

    if (roles?.length && !roles.some((r) => user.roles?.includes(r))) {
      throw new ForbiddenException('Insufficient role');
    }
    if (perms?.length && !perms.every((p) => user.permissions?.includes(p))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
