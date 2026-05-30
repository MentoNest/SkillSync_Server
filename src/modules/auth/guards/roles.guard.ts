import { Injectable, CanActivate, ExecutionContext, ForbiddenException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user || !user.roles || user.roles.length === 0) {
      throw new BusinessException('Access denied: No roles assigned', ErrorCodes.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    
    if (!hasRole) {
      // If admin role was required but not found, return NOT_ADMIN (201)
      if (requiredRoles.includes(UserRole.ADMIN)) {
        throw new BusinessException('Caller is not contract admin', ErrorCodes.NOT_ADMIN, HttpStatus.FORBIDDEN);
      }

      throw new BusinessException(
        `Access denied: Required roles: ${requiredRoles.join(', ')}`,
        ErrorCodes.UNAUTHORIZED,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
