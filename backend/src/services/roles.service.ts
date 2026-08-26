import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { AuditLogsService } from './audit-logs.service';
import { AuditEventType } from '../entities/audit-log.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Optional()
    private auditLogsService?: AuditLogsService,
  ) {}

  // Initialize default roles if they don't exist
  async initializeDefaultRoles() {
    const defaultRoles = [
      { name: 'admin', description: 'Full system access' },
      { name: 'mentor', description: 'Can mentor users' },
      { name: 'mentee', description: 'Can learn from mentors' },
    ];

    for (const role of defaultRoles) {
      const exists = await this.roleRepository.findOne({ where: { name: role.name } });
      if (!exists) {
        await this.roleRepository.save(this.roleRepository.create(role));
      }
    }
  }

  // Get all roles
  async getAllRoles() {
    return this.roleRepository.find();
  }

  // Create new role (dynamic role addition)
  async createRole(name: string, description: string, adminUser: User) {
    // Check if caller is admin
    const isAdmin = adminUser?.roles?.some(role => role.name === 'admin');
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can create new roles');
    }

    const existing = await this.roleRepository.findOne({ where: { name } });
    if (existing) {
      throw new BadRequestException(`Role ${name} already exists`);
    }

    const role = this.roleRepository.create({ name, description });
    return this.roleRepository.save(role);
  }

  // Assign role to user (admin only)
  async assignRoleToUser(userId: string, roleName: string, adminUser: User) {
    const isAdmin = adminUser?.roles?.some(role => role.name === 'admin');
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can assign roles');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.roleRepository.findOne({ where: { name: roleName } });
    if (!role) {
      throw new NotFoundException(`Role ${roleName} not found`);
    }

    // Check if user already has this role
    if (user.roles?.some(r => r.id === role.id)) {
      throw new BadRequestException(`User already has role ${roleName}`);
    }

    if (!user.roles) {
      user.roles = [];
    }
    user.roles.push(role);
    // Increment token version to invalidate existing tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.save(user);

    if (this.auditLogsService) {
      await this.auditLogsService.logEvent({
        userId: adminUser.id,
        eventType: AuditEventType.ROLE_ASSIGNED,
        details: { targetUserId: userId, roleName },
      });
    }

    return { success: true, message: `Role ${roleName} assigned to user`, tokenVersion: user.tokenVersion };
  }

  // Revoke role from user (admin only)
  async revokeRoleFromUser(userId: string, roleName: string, adminUser: User) {
    const isAdmin = adminUser?.roles?.some(role => role.name === 'admin');
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can revoke roles');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleIndex = user.roles ? user.roles.findIndex(r => r.name === roleName) : -1;
    if (roleIndex === -1) {
      throw new BadRequestException(`User does not have role ${roleName}`);
    }

    // Prevent removing last admin role (optional safety check)
    const adminRoles = user.roles.filter(r => r.name === 'admin');
    if (roleName === 'admin' && adminRoles.length === 1) {
      throw new BadRequestException('Cannot remove the only admin role from a user');
    }

    user.roles.splice(roleIndex, 1);
    // Increment token version to invalidate existing tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.save(user);

    if (this.auditLogsService) {
      await this.auditLogsService.logEvent({
        userId: adminUser.id,
        eventType: AuditEventType.ROLE_REVOKED,
        details: { targetUserId: userId, roleName },
      });
    }

    return { success: true, message: `Role ${roleName} revoked from user`, tokenVersion: user.tokenVersion };
  }

  // Assign default role (mentee) to new users
  async assignDefaultRoleToUser(user: User) {
    const defaultRole = await this.roleRepository.findOne({ where: { name: 'mentee' } });
    if (defaultRole) {
      if (!user.roles) {
        user.roles = [];
      }
      user.roles.push(defaultRole);
    }
    return user;
  }
}