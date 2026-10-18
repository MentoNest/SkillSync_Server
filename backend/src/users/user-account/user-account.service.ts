import { ConflictException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User, UserStatus } from '../entities/user.entity';

export const DEFAULT_GRACE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface SoftDeleteResult {
  deletedAt: Date;
  reactivateBy: Date;
  graceDays: number;
}

/** Soft delete / restore / purge lifecycle for user accounts (#1454). */
@Injectable()
export class UserAccountService {
  private readonly logger = new Logger(UserAccountService.name);
  private readonly graceDays: number;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(MentorProfile) private readonly mentors: Repository<MentorProfile>,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    const parsed = parseInt(config.get<string>('DELETE_GRACE_DAYS') ?? `${DEFAULT_GRACE_DAYS}`, 10);
    this.graceDays = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_DAYS;
  }

  /** Grace period in days, exposed for tests and callers. */
  get gracePeriodDays(): number {
    return this.graceDays;
  }

  private reactivateBy(deletedAt: Date): Date {
    return new Date(deletedAt.getTime() + this.graceDays * MS_PER_DAY);
  }

  private isExpired(deletedAt: Date): boolean {
    return Date.now() > this.reactivateBy(deletedAt).getTime();
  }

  async softDelete(userId: string): Promise<SoftDeleteResult> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.deletedAt) {
      return { deletedAt: user.deletedAt, reactivateBy: this.reactivateBy(user.deletedAt), graceDays: this.graceDays };
    }

    const now = new Date();
    user.status = UserStatus.DELETED;
    user.deletedAt = now;
    user.tokenVersion += 1;
    await this.users.save(user);
    await this.mentors.update({ userId }, { deletedAt: now });
    await this.audit.record({ event: AuditEvent.USER_DELETED, userId, metadata: { graceDays: this.graceDays } });
    return { deletedAt: now, reactivateBy: this.reactivateBy(now), graceDays: this.graceDays };
  }

  async restore(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.deletedAt) throw new ConflictException('Account is not deleted');
    if (this.isExpired(user.deletedAt)) throw new GoneException('Grace period has expired');

    user.deletedAt = null;
    user.status = UserStatus.ACTIVE;
    await this.users.save(user);
    await this.mentors.update({ userId }, { deletedAt: null });
    await this.audit.record({ event: AuditEvent.USER_RESTORED, userId });
    return user;
  }

  async listDeleted(
    page = 1,
    limit = 20,
  ): Promise<{ data: User[]; total: number; page: number; limit: number; totalPages: number }> {
    const [data, total] = await this.users.findAndCount({
      where: { status: UserStatus.DELETED },
      order: { deletedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 0 };
  }

  /** Permanent removal, only allowed once the grace period has elapsed. */
  async purge(userId: string): Promise<{ purged: boolean }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.deletedAt || !this.isExpired(user.deletedAt)) {
      throw new ConflictException('Account is still within the grace period');
    }
    await this.users.delete(userId);
    await this.audit.record({ event: AuditEvent.USER_PURGED, userId });
    return { purged: true };
  }

  /**
   * Anonymizes accounts whose grace period elapsed so persistent identifiers are
   * removed while the row (and its history) is retained. Runs daily at 04:00.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async anonymizeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - this.graceDays * MS_PER_DAY);
    const expired = await this.users.find({
      where: { status: UserStatus.DELETED, deletedAt: LessThan(cutoff) },
    });
    for (const user of expired) {
      user.walletAddress = `deleted:${user.id}`;
      user.displayName = null;
      user.email = null;
      user.avatarUrl = null;
      await this.users.save(user);
    }
    if (expired.length) this.logger.log(`Anonymized ${expired.length} accounts past the grace period`);
    return expired.length;
  }
}
