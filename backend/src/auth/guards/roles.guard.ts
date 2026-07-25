import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRole } from '../../common/enums/auth-role.enum.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { JwtAccessTokenPayload } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AuthRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: JwtAccessTokenPayload }>();
    return requiredRoles.some((role) => user?.roles?.includes(role));
  }
}
