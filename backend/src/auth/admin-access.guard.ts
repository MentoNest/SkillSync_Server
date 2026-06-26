import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthRole } from './enums/auth-role.enum';

@Injectable()
export class AdminAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: { roles?: string[] } }>();
    const roles: string[] = (user?.roles ?? []).map((r) => String(r).toLowerCase());
    if (!roles.includes(AuthRole.ADMIN)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
