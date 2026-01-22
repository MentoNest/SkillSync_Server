import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
  } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { ROLES_KEY } from '../decorators/roles.decorator';
  
  @Injectable()
  export class RbacGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}
  
    canActivate(context: ExecutionContext): boolean {
      const requiredRoles =
        this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
  
      // If no roles are required, allow access
      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }
  
      const request = context.switchToHttp().getRequest();
      const user = request.user;
  
      const userRoles: string[] | undefined = user?.roles;
  
      // Roles are required but user has none
      if (!userRoles || userRoles.length === 0) {
        throw new ForbiddenException();
      }
  
      const hasRequiredRole = requiredRoles.some((role) =>
        userRoles.includes(role),
      );
  
      if (!hasRequiredRole) {
        throw new ForbiddenException();
      }
  
      return true;
    }
  }
  