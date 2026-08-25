import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';

// Hierarchical role permissions - admin inherits all permissions from mentor and mentee
const roleHierarchy: Record<string, string[]> = {
  'admin': ['admin', 'mentor', 'mentee'],
  'mentor': ['mentor', 'mentee'],
  'mentee': ['mentee'],
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
    
    if (!requiredRoles) {
      return true; // No roles required, allow access
    }

    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];
    
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

      // Check if token version is valid (invalidate old tokens after role changes)
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new ForbiddenException('Token has been invalidated due to permission changes');
      }

      // Get user's role names
      const userRoles = user.roles.map(role => role.name);
      
      // Check if user has any of the required roles (considering hierarchy)
      const hasPermission = requiredRoles.some(requiredRole => 
        userRoles.some(userRole => 
          roleHierarchy[userRole]?.includes(requiredRole) || false
        )
      );

      if (!hasPermission) {
        throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
      }

      // Attach user to request for further use if needed
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Invalid token or insufficient permissions');
    }
  }
}