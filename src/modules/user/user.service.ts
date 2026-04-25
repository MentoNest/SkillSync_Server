import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../auth/entities/user.entity';
import { AuditLog, AuditEventType } from '../auth/entities/audit-log.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] });
    if (!user) throw new NotFoundException('User not found');
    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] });
    if (!user) throw new NotFoundException('User not found');
    Object.assign(user, dto);
    await this.userRepository.save(user);
    return this.toResponse(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] });
    if (!user) throw new NotFoundException('User not found');

    const gracePeriodDays = 30;
    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + gracePeriodDays);

    user.status = UserStatus.DELETED;
    user.gracePeriodEndsAt = gracePeriodEndsAt;
    await this.userRepository.save(user);

    await this.userRepository.softDelete(id);

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: user.id,
        walletAddress: user.walletAddress,
        eventType: AuditEventType.ACCOUNT_DELETED,
        ipAddress: 'system',
        metadata: {
          gracePeriodEndsAt,
          gracePeriodDays,
        },
      }),
    );
  }

  async findDeletedUsers(page = 1, limit = 20): Promise<{ users: UserResponseDto[]; total: number }> {
    const [users, total] = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .withDeleted()
      .where('user.deletedAt IS NOT NULL')
      .orderBy('user.deletedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      users: users.map((u) => this.toResponse(u)),
      total,
    };
  }

  async restoreUser(userId: string, restoredById?: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
      withDeleted: true,
    });

    if (!user || !user.deletedAt) {
      throw new NotFoundException('Soft-deleted user not found');
    }

    user.deletedAt = null;
    user.gracePeriodEndsAt = null;
    user.status = UserStatus.ACTIVE;
    user.tokenVersion += 1;
    await this.userRepository.save(user);

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: user.id,
        walletAddress: user.walletAddress,
        eventType: AuditEventType.ACCOUNT_RESTORED,
        ipAddress: 'system',
        metadata: {
          reason: 'restored_by_admin',
          restoredBy: restoredById ?? null,
        },
      }),
    );

    return this.toResponse(user);
  }

  private toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      locale: user.locale,
      roles: user.roles?.map((r) => r.name) ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
