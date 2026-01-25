import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

interface AuthUser {
  id: string;
  role?: string;
  roles?: string[];
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.get<string[]>('roles', context.getHandler()) ?? [];

    type RequestWithUser = Request & { user?: AuthUser };
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) return false;

    const userRoles = user.roles ?? (user.role ? [user.role] : []);

    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
