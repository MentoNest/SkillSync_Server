import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { UserStatus } from '../user-status/user-status.enum';
import { UserSuspension } from './entities/user-suspension.entity';

export interface SuspendOptions {
  reason: string;
  /** Days until the suspension expires; null/undefined for permanent. */
  days?: number | null;
}

export interface LoginSuspension {
  reason: string;
  suspendedUntil: Date | null;
}

const DAY_MS = 86_400_000;

@Injectable()
export class SuspensionService {
  private readonly logger = new Logger(SuspensionService.name);

  constructor(
    @InjectRepository(UserSuspension) private readonly suspensions: Repository<UserSuspension>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async suspend(userId: string, adminId: string, options: SuspendOptions): Promise<UserSuspension> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const days = options.days ?? null;
    const suspendedUntil = days && days > 0 ? new Date(Date.now() + days * DAY_MS) : null;

    const record = await this.suspensions.save(
      this.suspensions.create({
        userId,
        reason: options.reason,
        suspendedBy: adminId,
        suspendedAt: new Date(),
        suspendedUntil,
        active: true,
      }),
    );

    // Suspension invalidates every access token issued so far.
    user.status = UserStatus.SUSPENDED;
    user.tokenVersion += 1;
    await this.users.save(user);

    await this.audit.record({
      event: AuditEvent.USER_SUSPENDED,
      userId,
      metadata: { adminId, reason: options.reason, suspendedUntil },
    });
    await this.sendSuspensionEmail(user, record);
    return record;
  }

  async unsuspend(userId: string, adminId: string): Promise<{ unsuspended: number }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const res = await this.suspensions.update({ userId, active: true }, { active: false });
    if (user.status === UserStatus.SUSPENDED) {
      user.status = UserStatus.ACTIVE;
      await this.users.save(user);
    }

    await this.audit.record({ event: AuditEvent.USER_UNSUSPENDED, userId, metadata: { adminId } });
    return { unsuspended: res.affected ?? 0 };
  }

  /**
   * Returns the active suspension for a user, auto-expiring it (and lifting the
   * account status) when its `suspendedUntil` has passed.
   */
  async currentSuspension(userId: string): Promise<UserSuspension | null> {
    const row = await this.suspensions.findOne({
      where: { userId, active: true },
      order: { suspendedAt: 'DESC' },
    });
    if (!row) return null;

    if (row.suspendedUntil && row.suspendedUntil.getTime() <= Date.now()) {
      row.active = false;
      await this.suspensions.save(row);
      const user = await this.users.findOne({ where: { id: userId } });
      if (user && user.status === UserStatus.SUSPENDED) {
        user.status = UserStatus.ACTIVE;
        await this.users.save(user);
      }
      return null;
    }
    return row;
  }

  /** Currently suspended users (expired rows are swept first). Powers the admin dashboard. */
  async listActive(): Promise<UserSuspension[]> {
    const rows = await this.suspensions.find({ where: { active: true }, order: { suspendedAt: 'DESC' } });
    const active: UserSuspension[] = [];
    for (const row of rows) {
      if (row.suspendedUntil && row.suspendedUntil.getTime() <= Date.now()) {
        row.active = false;
        await this.suspensions.save(row);
        continue;
      }
      active.push(row);
    }
    return active;
  }

  /** Used by the auth flow: null when the user may log in, else the block reason. */
  async checkLogin(userId: string): Promise<LoginSuspension | null> {
    const row = await this.currentSuspension(userId);
    if (!row) return null;
    return { reason: row.reason, suspendedUntil: row.suspendedUntil };
  }

  /** Notification placeholder — real email delivery lands with the notifications feature. */
  async sendSuspensionEmail(user: User, suspension: UserSuspension): Promise<void> {
    this.logger.log(
      `[notification-placeholder] suspension email to ${user.walletAddress}: ${suspension.reason} ` +
        `(until ${suspension.suspendedUntil?.toISOString() ?? 'permanent'})`,
    );
  }
}
