import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { UserStatus } from './enums/user-status.enum';
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
      user = this.userRepo.create({ walletAddress, roles: menteeRole ? [menteeRole] : [], status: UserStatus.ACTIVE });
      await this.userRepo.save(user);
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id, status: UserStatus.ACTIVE } });
  }

  async updateStatus(userId: string, newStatus: UserStatus): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status === UserStatus.DELETED && newStatus !== UserStatus.DELETED) {
      throw new BadRequestException('Cannot reactivate a deleted user');
    }

    user.status = newStatus;
    user.tokenVersion += 1;
    return this.userRepo.save(user);
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

  async featureMentor(userId: string, audit?: RequestAudit): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Mentor not found');
    
    // Enforce max featured mentors
    const maxFeatured = 10;
    const currentFeaturedCount = await this.userRepo.count({ where: { isFeatured: true } });
    
    if (!user.isFeatured && currentFeaturedCount >= maxFeatured) {
      throw new BadRequestException(`Maximum of ${maxFeatured} featured mentors reached`);
    }

    user.isFeatured = true;
    user.featuredAt = new Date();
    // Sort logic (just set to count if not set)
    if (user.featuredOrder === null || user.featuredOrder === undefined) {
       const maxOrderUser = await this.userRepo.findOne({
          where: { isFeatured: true },
          order: { featuredOrder: 'DESC' }
       });
       user.featuredOrder = maxOrderUser?.featuredOrder != null ? maxOrderUser.featuredOrder + 1 : 1;
    }

    const saved = await this.userRepo.save(user);

    if (audit) {
      await this.auditLogService.logEvent({
        userId,
        eventType: 'MENTOR_FEATURED' as AuditEventType,
        audit,
        details: { featuredOrder: user.featuredOrder },
      });
    }

    return saved;
  }

  async unfeatureMentor(userId: string, audit?: RequestAudit): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Mentor not found');

    user.isFeatured = false;
    user.featuredAt = null;
    user.featuredOrder = null;

    const saved = await this.userRepo.save(user);

    if (audit) {
      await this.auditLogService.logEvent({
        userId,
        eventType: 'MENTOR_UNFEATURED' as AuditEventType,
        audit,
        details: {},
      });
    }

    return saved;
  }

  async getFeaturedMentors(page: number = 1, limit: number = 10): Promise<{ items: User[], meta: { total: number, page: number, lastPage: number } }> {
    const [items, total] = await this.userRepo.findAndCount({
      where: { isFeatured: true },
      order: { featuredOrder: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
