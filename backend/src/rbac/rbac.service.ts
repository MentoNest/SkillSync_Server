import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from './entities/role.entity';
import { RoleName } from './roles';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Roles and the union of their permissions, for embedding in the access token. */
  async claimsFor(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { roles: true } });
    const roles = user?.roles ?? [];
    return {
      roles: roles.map((r) => r.name),
      permissions: [...new Set(roles.flatMap((r) => r.permissions))],
    };
  }

  async assignRole(userId: string, name: RoleName): Promise<void> {
    const [user, role] = await Promise.all([
      this.users.findOne({ where: { id: userId }, relations: { roles: true } }),
      this.roles.findOne({ where: { name } }),
    ]);
    if (!user || !role) return;
    if (!user.roles.some((r) => r.id === role.id)) {
      user.roles.push(role);
      await this.users.save(user);
    }
  }
}
