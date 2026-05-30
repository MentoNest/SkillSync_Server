import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { UserSuspension } from '../users/entities/user-suspension.entity';

@Injectable()
export class SuspensionService {
  private readonly logger = new Logger(SuspensionService.name);

  constructor(
    @InjectRepository(UserSuspension)
    private readonly userSuspensionRepository: Repository<UserSuspension>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async getActiveSuspension(userId: string): Promise<UserSuspension | null> {
    const now = new Date();
    return this.userSuspensionRepository
      .createQueryBuilder('suspension')
      .where('suspension.userId = :userId', { userId })
      .andWhere('suspension.liftedAt IS NULL')
      .andWhere('(suspension.suspendedUntil IS NULL OR suspension.suspendedUntil > :now)', {
        now,
      })
      .orderBy('suspension.suspendedAt', 'DESC')
      .getOne();
  }

  async suspendUser(
    userId: string,
    adminId: string,
    reason: string,
    durationDays?: number | null,
  ): Promise<UserSuspension> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeSuspension = await this.getActiveSuspension(userId);
    if (activeSuspension) {
      throw new BadRequestException('User is already suspended');
    }

    const suspendedUntil = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const suspension = manager.create(UserSuspension, {
        userId,
        reason,
        suspendedBy: adminId,
        suspendedUntil,
        liftedAt: null,
        liftedBy: null,
        liftedReason: null,
      });

      const savedSuspension = await manager.save(UserSuspension, suspension);
      await manager
        .createQueryBuilder(RefreshToken, 'refresh_token')
        .update(RefreshToken)
        .set({ revokedAt: new Date() })
        .where('userId = :userId AND revokedAt IS NULL', { userId })
        .execute();

      await this.auditLogService.logUserSuspension({
        userId,
        suspendedBy: adminId,
        reason,
        suspendedUntil: suspendedUntil ? suspendedUntil.toISOString() : null,
        audit: {
          ipAddress: null,
          userAgent: null,
          deviceFingerprint: null,
        },
      });

      this.logger.log(
        `Suspension email placeholder: user=${userId} suspendedBy=${adminId} suspendedUntil=${
          suspendedUntil ? suspendedUntil.toISOString() : 'permanent'
        } reason=${reason}`,
      );

      return savedSuspension;
    });
  }

  async unsuspendUser(userId: string, adminId: string): Promise<UserSuspension> {
    const suspension = await this.userSuspensionRepository
      .createQueryBuilder('suspension')
      .where('suspension.userId = :userId', { userId })
      .andWhere('suspension.liftedAt IS NULL')
      .andWhere('(suspension.suspendedUntil IS NULL OR suspension.suspendedUntil > :now)', {
        now: new Date(),
      })
      .orderBy('suspension.suspendedAt', 'DESC')
      .getOne();

    if (!suspension) {
      throw new NotFoundException('Active suspension not found');
    }

    suspension.liftedAt = new Date();
    suspension.liftedBy = adminId;
    suspension.liftedReason = 'Unsuspended by administrator';

    const saved = await this.userSuspensionRepository.save(suspension);
    await this.auditLogService.logUserUnsuspension({
      userId,
      liftedBy: adminId,
      audit: {
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
      },
    });

    return saved;
  }

  async listActiveSuspensions(limit = 50, offset = 0): Promise<{ items: UserSuspension[]; total: number }> {
    const now = new Date();
    const query = this.userSuspensionRepository
      .createQueryBuilder('suspension')
      .leftJoinAndSelect('suspension.user', 'user')
      .where('suspension.liftedAt IS NULL')
      .andWhere('(suspension.suspendedUntil IS NULL OR suspension.suspendedUntil > :now)', {
        now,
      })
      .orderBy('suspension.suspendedAt', 'DESC')
      .take(limit)
      .skip(offset);

    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }
}
