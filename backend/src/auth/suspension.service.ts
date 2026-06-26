import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { UserSuspension } from '../users/entities/user-suspension.entity';

@Injectable()
export class SuspensionService {
  constructor(
    @InjectRepository(UserSuspension)
    private readonly repo: Repository<UserSuspension>,
  ) {}

  async suspendUser(
    userId: string,
    reason: string,
    suspendedBy: string,
    durationDays?: number,
  ): Promise<UserSuspension> {
    const suspendedUntil = durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;
    const record = this.repo.create({ userId, reason, suspendedBy, suspendedUntil, isActive: true });
    return this.repo.save(record);
  }

  async unsuspendUser(userId: string): Promise<void> {
    await this.repo.update({ userId, isActive: true }, { isActive: false });
  }

  async isSuspended(userId: string): Promise<{ suspended: boolean; reason?: string; until?: Date | null }> {
    const record = await this.repo.findOne({
      where: { userId, isActive: true, suspendedUntil: IsNull() },
    });

    if (record) {
      return { suspended: true, reason: record.reason, until: record.suspendedUntil };
    }

    // Check time-based suspensions
    const timed = await this.repo
      .createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .andWhere('s.isActive = true')
      .andWhere('s.suspendedUntil > NOW()')
      .getOne();

    if (timed) {
      return { suspended: true, reason: timed.reason, until: timed.suspendedUntil };
    }

    return { suspended: false };
  }

  async assertNotSuspended(userId: string): Promise<void> {
    const { suspended, reason, until } = await this.isSuspended(userId);
    if (suspended) {
      const msg = until
        ? `Account suspended until ${until.toISOString()}: ${reason}`
        : `Account permanently suspended: ${reason}`;
      throw new ForbiddenException(msg);
    }
  }
}
