import { Injectable, NotFoundException, OnModuleInit, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { isValidUsername } from './validators/username.validator';
import { AuditLogService, RequestAudit } from '../auth/audit-log.service';
import { AuditEventType } from '../auth/entities/audit-log.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedRoles();
  }

  async findOrCreate(walletAddress: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { walletAddress } });
    if (!user) {
      const menteeRole = await this.roleRepo.findOne({ where: { name: AuthRole.MENTEE } });
      user = this.userRepo.create({ walletAddress, roles: menteeRole ? [menteeRole] : [] });
      await this.userRepo.save(user);
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async assignRole(userId: string, roleName: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.roleRepo.findOne({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role '${roleName}' not found`);

    if (!user.roles.some((r) => r.name === roleName)) {
      user.roles = [...user.roles, role];
      user.tokenVersion += 1;
      await this.userRepo.save(user);
    }
    return user;
  }

  async revokeRole(userId: string, roleName: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.roles = user.roles.filter((r) => r.name !== roleName);
    user.tokenVersion += 1;
    await this.userRepo.save(user);
    return user;
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    await this.userRepo.increment({ id: userId }, 'tokenVersion', 1);
  }

  private async seedRoles(): Promise<void> {
    const predefined = [
      { name: AuthRole.ADMIN, description: 'Full system access' },
      { name: AuthRole.MENTOR, description: 'Can mentor other users' },
      { name: AuthRole.MENTEE, description: 'Default role for new users' },
    ];

    for (const r of predefined) {
      const exists = await this.roleRepo.findOne({ where: { name: r.name } });
      if (!exists) {
        await this.roleRepo.save(this.roleRepo.create(r));
      }
    }
  }

  async checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
    if (!isValidUsername(username)) {
      return { available: false };
    }

    const existingUser = await this.userRepo.findOne({ where: { username } });
    return { available: !existingUser };
  }

  async updateUsername(userId: string, newUsername: string, audit?: RequestAudit): Promise<User> {
    if (!isValidUsername(newUsername)) {
      throw new BadRequestException('Invalid username format');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldUsername = user.username;

    // Check if username is already taken
    const existingUser = await this.userRepo.findOne({ where: { username: newUsername } });
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Username is already taken');
    }

    // Check cooldown (30 days between username changes)
    if (user.usernameChangedAt) {
      const cooldownPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      const timeSinceLastChange = Date.now() - user.usernameChangedAt.getTime();
      if (timeSinceLastChange < cooldownPeriod) {
        const daysRemaining = Math.ceil((cooldownPeriod - timeSinceLastChange) / (24 * 60 * 60 * 1000));
        throw new BadRequestException(
          `You can change your username again in ${daysRemaining} days`,
        );
      }
    }

    user.username = newUsername;
    user.usernameChangedAt = new Date();
    
    // Set default display name based on wallet address if not set
    if (!user.displayName && user.walletAddress) {
      user.displayName = `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
    }

    const savedUser = await this.userRepo.save(user);

    // Log username change in audit log
    if (audit) {
      await this.auditLogService.logEvent({
        userId,
        eventType: AuditEventType.USERNAME_CHANGED,
        audit,
        details: {
          oldUsername,
          newUsername,
        },
      });
    }

    return savedUser;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.displayName = displayName;
    return this.userRepo.save(user);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { username } });
  }
}
