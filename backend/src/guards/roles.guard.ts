import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_INACTIVE_STATUS_KEY } from '../decorators/allow-inactive-status.decorator';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../entities/user.entity';
import { Role } from '../entities/role.entity';

// Hierarchical role permissions - admin inherits all permissions from mentor and mentee
const roleHierarchy: Record<string, string[]> = {
  admin: ['admin', 'mentor', 'mentee'],
  mentor: ['mentor', 'mentee'],
  mentee: ['mentee'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowInactiveStatus = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_STATUS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!requiredRoles && !token) {
      return true; // No roles required and no token provided, allow public access
    }

    if (!token) {
      throw new ForbiddenException('No token provided');
    }

    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: { roles: true },
      });

      if (!user) {
        throw new ForbiddenException('User not found');
      }

      // Check if user is locked
      if (user.isLocked) {
        if (user.lockoutUntil && new Date() > new Date(user.lockoutUntil)) {
          user.isLocked = false;
          user.lockoutUntil = null;
          await this.userRepository.save(user);
        } else {
          throw new ForbiddenException('Account is temporarily locked');
        }
      }

      // Check if token version is valid (invalidate old tokens after role changes / session revocations)
      if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
        throw new ForbiddenException('Token has been invalidated due to permission changes or session revocation');
      }

      // #1176: reject requests from non-active users at the guard level.
      // Routes that a non-active user legitimately needs (e.g. restoring a
      // soft-deleted account) opt out via @AllowInactiveStatus().
      if (!allowInactiveStatus && user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException(this.buildInactiveStatusError(user));
      }

      // Attach user to request for further use
      request.user = user;

      if (!requiredRoles) {
        return true;
      }

      // Get user's role names
      const userRoles = user.roles ? user.roles.map((role) => role.name) : [];

      // Check if user has any of the required roles (considering hierarchy)
      const hasPermission = requiredRoles.some((requiredRole) =>
        userRoles.some(
          (userRole) => roleHierarchy[userRole]?.includes(requiredRole) || false,
        ),
      );

      if (!hasPermission) {
        throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Invalid token or insufficient permissions');
    }
  }

  /**
   * #1176 (extended by #1174/#1175): builds the 403 payload for a
   * non-active user attempting an authenticated request. Suspension/deletion
   * specific detail (reason, expiry) is layered on by UserService-side
   * checks at login; here we only know the coarse status.
   */
  private buildInactiveStatusError(user: User): Record<string, any> {
    switch (user.status) {
      case UserStatus.SUSPENDED:
        return {
          statusCode: 403,
          message: 'This account is suspended.',
          code: 'account_suspended',
        };
      case UserStatus.DELETED:
        return {
          statusCode: 403,
          message: 'This account has been deleted.',
          code: 'account_deleted',
        };
      case UserStatus.PENDING_VERIFICATION:
        return {
          statusCode: 403,
          message: 'This account is pending verification.',
          code: 'account_pending_verification',
        };
      default:
        return {
          statusCode: 403,
          message: 'This account is not active.',
          code: 'account_inactive',
        };
    }
  }
}