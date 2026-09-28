import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities/role.entity.js';
import { User } from '../entities/user.entity.js';
import { AuditService } from '../audit/audit.service';
import { RoleName, resolvePermissions } from '../rbac/role-permissions';

export interface ActorContext {
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * #1318: role administration.
 *
 * Owns the lifecycle of role rows and of the `user_roles` junction table. Every
 * mutation bumps the target user's `tokenVersion`, which invalidates the access
 * tokens issued before the change (the guard rejects them on the next request)
 * so a revoked role can never be used with a still-valid token.
 */
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Optional()
    private readonly auditService?: AuditService,
  ) {}

  // ─── Role catalogue ─────────────────────────────────────────────────────

  async getAllRoles(): Promise<Role[]> {
    return this.roleRepository.find({ order: { name: 'ASC' } });
  }

  async getRoleByName(name: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { name } });
    if (!role) {
      throw new NotFoundException(`Role ${name} not found`);
    }
    return role;
  }

  /**
   * Creates the predefined roles when they are missing. Idempotent: safe to run
   * on every boot (the admin seed relies on that).
   */
  async initializeDefaultRoles(): Promise<string[]> {
    const defaults: Array<{ name: string; description: string }> = [
      { name: RoleName.ADMIN, description: 'Full system access' },
      { name: RoleName.MENTOR, description: 'Can mentor users' },
      { name: RoleName.MENTEE, description: 'Can learn from mentors' },
    ];

    const created: string[] = [];

    for (const role of defaults) {
      const exists = await this.roleRepository.findOne({ where: { name: role.name } });
      if (exists) {
        // Keep the shipped permission set authoritative for predefined roles
        // unless the row already carries custom permissions.
        if (!exists.permissions?.length) {
          exists.permissions = Role.defaultPermissionsFor(role.name);
          exists.isSystem = true;
          await this.roleRepository.save(exists);
        }
        continue;
      }

      await this.roleRepository.save(
        this.roleRepository.create({
          name: role.name,
          description: role.description,
          permissions: Role.defaultPermissionsFor(role.name),
          isSystem: true,
        }),
      );
      created.push(role.name);
    }

    if (created.length) {
      this.logger.log(`Created default role(s): ${created.join(', ')}`);
    }

    return created;
  }

  /** #1318: dynamic role creation for anything outside the predefined trio. */
  async createRole(
    name: string,
    description?: string,
    permissions: string[] = [],
  ): Promise<Role> {
    const normalized = (name ?? '').trim().toLowerCase();

    if (!/^[a-z][a-z0-9_-]{1,49}$/.test(normalized)) {
      throw new BadRequestException(
        'Role name must be 2-50 characters, start with a letter and contain only a-z, 0-9, "-" or "_"',
      );
    }

    if (await this.roleRepository.findOne({ where: { name: normalized } })) {
      throw new BadRequestException(`Role ${normalized} already exists`);
    }

    return this.roleRepository.save(
      this.roleRepository.create({
        name: normalized,
        description: description ?? '',
        permissions,
        isSystem: false,
      }),
    );
  }

  async updateRole(
    name: string,
    changes: { description?: string; permissions?: string[] },
  ): Promise<Role> {
    const role = await this.getRoleByName(name);

    if (changes.description !== undefined) {
      role.description = changes.description;
    }
    if (changes.permissions !== undefined) {
      if (role.isSystem && changes.permissions.length === 0) {
        throw new BadRequestException('Predefined roles must keep at least one permission');
      }
      role.permissions = changes.permissions;
    }

    return this.roleRepository.save(role);
  }

  // ─── Assignments ────────────────────────────────────────────────────────

  async getUserRoles(userId: string): Promise<string[]> {
    const user = await this.findUserWithRoles(userId);
    return user.roles?.map((role) => role.name) ?? [];
  }

  /** Effective (hierarchy expanded) permission set of a user. */
  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.findUserWithRoles(userId);
    return resolvePermissions(user.roles ?? []);
  }

  async assignRoleToUser(
    userId: string,
    roleName: string,
    actor?: ActorContext,
  ): Promise<{ userId: string; roleName: string; tokenVersion: number; roles: string[] }> {
    const user = await this.findUserWithRoles(userId);
    const role = await this.getRoleByName(roleName);

    if (user.roles?.some((held) => held.name === role.name)) {
      throw new BadRequestException(`User already has role ${role.name}`);
    }

    user.roles = [...(user.roles ?? []), role];
    const tokenVersion = await this.bumpTokenVersion(user);
    await this.userRepository.save(user);

    await this.auditService?.logRoleChange({
      targetUserId: userId,
      actorId: actor?.userId ?? 'system',
      roleName: role.name,
      action: 'assigned',
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      tokenVersion,
    });

    return {
      userId,
      roleName: role.name,
      tokenVersion,
      roles: user.roles.map((held) => held.name),
    };
  }

  async revokeRoleFromUser(
    userId: string,
    roleName: string,
    actor?: ActorContext,
  ): Promise<{ userId: string; roleName: string; tokenVersion: number; roles: string[] }> {
    const user = await this.findUserWithRoles(userId);
    const role = await this.getRoleByName(roleName);

    if (!user.roles?.some((held) => held.name === role.name)) {
      throw new BadRequestException(`User does not have role ${role.name}`);
    }

    // Never leave the platform without an administrator.
    if (role.name === RoleName.ADMIN) {
      await this.assertNotLastAdmin();
    }

    user.roles = user.roles.filter((held) => held.name !== role.name);
    const tokenVersion = await this.bumpTokenVersion(user);
    await this.userRepository.save(user);

    await this.auditService?.logRoleChange({
      targetUserId: userId,
      actorId: actor?.userId ?? 'system',
      roleName: role.name,
      action: 'revoked',
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      tokenVersion,
    });

    return {
      userId,
      roleName: role.name,
      tokenVersion,
      roles: user.roles.map((held) => held.name),
    };
  }

  /** Replaces the whole role set of a user in one audited, atomic step. */
  async setRolesForUser(
    userId: string,
    roleNames: string[],
    actor?: ActorContext,
  ): Promise<{ userId: string; tokenVersion: number; roles: string[] }> {
    const user = await this.findUserWithRoles(userId);
    const wasAdmin = user.roles?.some((held) => held.name === RoleName.ADMIN) ?? false;

    if (wasAdmin && !roleNames.includes(RoleName.ADMIN)) {
      await this.assertNotLastAdmin();
    }

    const roles = await Promise.all(roleNames.map((name) => this.getRoleByName(name)));
    const before = user.roles?.map((held) => held.name) ?? [];

    user.roles = roles;
    const tokenVersion = await this.bumpTokenVersion(user);
    await this.userRepository.save(user);

    const assigned = roles.filter((role) => !before.includes(role.name)).map((role) => role.name);
    const revoked = before.filter((name) => !roleNames.includes(name));

    for (const roleName of assigned) {
      await this.auditService?.logRoleChange({
        targetUserId: userId,
        actorId: actor?.userId ?? 'system',
        roleName,
        action: 'assigned',
        ipAddress: actor?.ipAddress,
        userAgent: actor?.userAgent,
        tokenVersion,
      });
    }
    for (const roleName of revoked) {
      await this.auditService?.logRoleChange({
        targetUserId: userId,
        actorId: actor?.userId ?? 'system',
        roleName,
        action: 'revoked',
        ipAddress: actor?.ipAddress,
        userAgent: actor?.userAgent,
        tokenVersion,
      });
    }

    return { userId, tokenVersion, roles: roleNames };
  }

  /**
   * #1318: new accounts get `mentee` by default (or `mentor` when they signed
   * up as a mentor) so they are never left without any role.
   */
  async assignDefaultRoleToUser(user: User, roleName: string = RoleName.MENTEE): Promise<User> {
    if (user.roles?.length) {
      return user;
    }

    const role = await this.roleRepository.findOne({ where: { name: roleName } });
    if (!role) {
      this.logger.warn(`Default role ${roleName} is missing, skipping assignment`);
      return user;
    }

    user.roles = [role];
    return this.userRepository.save(user);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async findUserWithRoles(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /** Throws when the platform would be left without a single administrator. */
  private async assertNotLastAdmin(): Promise<void> {
    const adminCount = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role', 'role.name = :roleName', { roleName: RoleName.ADMIN })
      .getCount();

    if (adminCount <= 1) {
      throw new BadRequestException('Cannot remove the only admin role from a user');
    }
  }

  /**
   * Role changes are password-equivalent: every previously issued access token
   * must stop working, which is what `tokenVersion` is compared against.
   */
  private async bumpTokenVersion(user: User): Promise<number> {
    const next = (user.tokenVersion ?? 0) + 1;

    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ tokenVersion: next })
      .where('id = :id', { id: user.id })
      .execute();

    user.tokenVersion = next;
    return next;
  }
}
