import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { AuditLogService, RequestAudit } from './audit-log.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

export interface SoftDeleteResult {
  message: string;
  deletedAt: Date;
  reactivationDeadline: Date;
  graceDays: number;
}

export interface RestoreResult {
  message: string;
  restoredAt: Date;
  userId: string;
}

export interface PermanentDeleteResult {
  message: string;
  userId: string;
  anonymized: boolean;
}

@Injectable()
export class SoftDeleteService {
  private readonly logger = new Logger(SoftDeleteService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── Grace period config ────────────────────────────────────────────────────

  get graceDays(): number {
    const raw = this.configService.get<string>('DELETE_GRACE_DAYS');
    const parsed = parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  private reactivationDeadline(deletedAt: Date): Date {
    const d = new Date(deletedAt);
    d.setDate(d.getDate() + this.graceDays);
    return d;
  }

  private isWithinGracePeriod(deletedAt: Date): boolean {
    return new Date() < this.reactivationDeadline(deletedAt);
  }

  // ─── Soft delete ────────────────────────────────────────────────────────────

  /**
   * Soft-deletes a user account and all related profile data.
   * Revokes all active refresh tokens so existing sessions terminate immediately.
   */
  async softDeleteUser(
    userId: string,
    audit: RequestAudit,
  ): Promise<SoftDeleteResult> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.deletedAt) {
      throw new ForbiddenException('Account is already deleted');
    }

    const now = new Date();

    await this.dataSource.transaction(async (manager: EntityManager) => {
      // Soft-delete the user
      await manager.update(User, { id: userId }, {
        deletedAt: now,
        status: 'deleted',
      });

      // Cascade soft-delete to related profile entities
      await this.cascadeSoftDelete(manager, userId, now);

      // Immediately revoke all active refresh tokens
      await manager.update(
        RefreshToken,
        { userId, revokedAt: null },
        { revokedAt: now },
      );
    });

    await this.auditLogService.logPasswordEquivalentChange({
      userId,
      audit,
      details: { reason: 'soft_delete', deletedAt: now.toISOString() },
    });

    this.logger.log(`User soft-deleted: ${userId}`);

    return {
      message: `Account deleted. You may reactivate within ${this.graceDays} days.`,
      deletedAt: now,
      reactivationDeadline: this.reactivationDeadline(now),
      graceDays: this.graceDays,
    };
  }

  // ─── Restore ────────────────────────────────────────────────────────────────

  /**
   * Restores a soft-deleted account if within the grace period.
   * Called automatically on login attempt, or explicitly via POST /user/account/restore.
   */
  async restoreUser(
    userId: string,
    audit: RequestAudit,
  ): Promise<RestoreResult> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.deletedAt) {
      throw new ForbiddenException('Account is not deleted');
    }

    if (!this.isWithinGracePeriod(user.deletedAt)) {
      throw new ForbiddenException(
        `Grace period expired on ${this.reactivationDeadline(user.deletedAt).toISOString()}. Account can no longer be restored.`,
      );
    }

    const now = new Date();

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.update(User, { id: userId }, {
        deletedAt: null,
        status: 'active',
      });

      // Restore cascaded profile entities
      await this.cascadeRestore(manager, userId);
    });

    await this.auditLogService.logPasswordEquivalentChange({
      userId,
      audit,
      details: { reason: 'account_restored', restoredAt: now.toISOString() },
    });

    this.logger.log(`User account restored: ${userId}`);

    return {
      message: 'Account successfully reactivated.',
      restoredAt: now,
      userId,
    };
  }

  // ─── Login gate ─────────────────────────────────────────────────────────────

  /**
   * Called inside AuthService.login() before issuing tokens.
   * Throws a 403 with reactivation instructions if account is soft-deleted.
   * Auto-restores if within grace period and the user actively logs in.
   */
  async assertNotSoftDeleted(
    user: User,
    audit: RequestAudit,
    autoRestore = true,
  ): Promise<void> {
    if (!user.deletedAt) return;

    if (!this.isWithinGracePeriod(user.deletedAt)) {
      throw new ForbiddenException(
        'This account has been deleted and the recovery window has passed. Please contact support.',
      );
    }

    if (autoRestore) {
      // Login within grace period = implicit reactivation
      await this.restoreUser(user.id, audit);
      return;
    }

    const deadline = this.reactivationDeadline(user.deletedAt).toISOString();
    throw new ForbiddenException(
      `Account is pending deletion. Reactivate at POST /user/account/restore before ${deadline}.`,
    );
  }

  // ─── Admin: permanent delete ─────────────────────────────────────────────────

  /**
   * Permanently deletes or anonymizes a soft-deleted user after grace period.
   * Only callable by admins. Anonymizes PII rather than hard-deleting by default.
   */
  async permanentlyDeleteUser(
    userId: string,
    audit: RequestAudit,
    options: { anonymize?: boolean; force?: boolean } = {},
  ): Promise<PermanentDeleteResult> {
    const { anonymize = true, force = false } = options;

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.deletedAt && !force) {
      throw new ForbiddenException(
        'User has not been soft-deleted. Use force=true to override.',
      );
    }

    if (user.deletedAt && this.isWithinGracePeriod(user.deletedAt) && !force) {
      throw new ForbiddenException(
        `Grace period has not expired yet (ends ${this.reactivationDeadline(user.deletedAt).toISOString()}). Use force=true to override.`,
      );
    }

    await this.dataSource.transaction(async (manager: EntityManager) => {
      if (anonymize) {
        await this.anonymizeUser(manager, userId);
      } else {
        // Hard delete — cascade via FK constraints or manual removal
        await this.hardDeleteUser(manager, userId);
      }
    });

    await this.auditLogService.logPasswordEquivalentChange({
      userId,
      audit,
      details: {
        reason: anonymize ? 'account_anonymized' : 'account_hard_deleted',
        performedBy: audit.userId,
      },
    });

    this.logger.warn(`User permanently removed: ${userId} (anonymize=${anonymize})`);

    return {
      message: anonymize
        ? 'User data anonymized successfully.'
        : 'User permanently deleted.',
      userId,
      anonymized: anonymize,
    };
  }

  // ─── Admin: list soft-deleted ────────────────────────────────────────────────

  /**
   * Returns all soft-deleted users for admin review.
   * Optionally filters to only those past the grace period (eligible for permanent deletion).
   */
  async listSoftDeletedUsers(options: {
    expiredOnly?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{ users: User[]; total: number }> {
    const { expiredOnly = false, page = 1, limit = 20 } = options;

    const graceDeadline = new Date();
    graceDeadline.setDate(graceDeadline.getDate() - this.graceDays);

    const qb = this.userRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('user.deletedAt IS NOT NULL');

    if (expiredOnly) {
      qb.andWhere('user.deletedAt <= :graceDeadline', { graceDeadline });
    }

    const [users, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { users, total };
  }

  // ─── Scheduled cleanup ───────────────────────────────────────────────────────

  /**
   * Intended to be called by a cron job (e.g. daily).
   * Anonymizes all soft-deleted accounts whose grace period has expired.
   */
  async runGracePeriodCleanup(audit: RequestAudit): Promise<{ processed: number }> {
    const graceDeadline = new Date();
    graceDeadline.setDate(graceDeadline.getDate() - this.graceDays);

    const expired = await this.userRepository.find({
      where: { deletedAt: LessThan(graceDeadline) },
      withDeleted: true,
    });

    let processed = 0;
    for (const user of expired) {
      try {
        await this.permanentlyDeleteUser(user.id, audit, {
          anonymize: true,
          force: true,
        });
        processed++;
      } catch (err) {
        this.logger.error(`Cleanup failed for user ${user.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(`Grace period cleanup complete: ${processed}/${expired.length} users processed`);
    return { processed };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Cascade soft-delete to related profile entities.
   * Extend this method as new related tables are added.
   */
  private async cascadeSoftDelete(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<void> {
    // Example cascade targets — add/remove based on your schema
    const tables = ['profile', 'mentorship', 'session', 'review'];
    for (const table of tables) {
      try {
        await manager
          .createQueryBuilder()
          .update(table)
          .set({ deletedAt: now })
          .where('userId = :userId AND deletedAt IS NULL', { userId })
          .execute();
      } catch {
        // Table may not exist in all environments — log and continue
        this.logger.debug(`Cascade soft-delete skipped for table: ${table}`);
      }
    }
  }

  /**
   * Reverse cascade soft-delete for all related profile entities.
   */
  private async cascadeRestore(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const tables = ['profile', 'mentorship', 'session', 'review'];
    for (const table of tables) {
      try {
        await manager
          .createQueryBuilder()
          .update(table)
          .set({ deletedAt: null })
          .where('userId = :userId AND deletedAt IS NOT NULL', { userId })
          .execute();
      } catch {
        this.logger.debug(`Cascade restore skipped for table: ${table}`);
      }
    }
  }

  /**
   * Anonymize PII fields in place — retains the row for referential integrity.
   */
  private async anonymizeUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const anon = `deleted_${userId.slice(0, 8)}`;
    await manager.update(User, { id: userId }, {
      walletAddress: `anon_${anon}`,
      email: `${anon}@deleted.invalid`,
      username: anon,
      deletedAt: new Date(),
      status: 'anonymized',
    });

    // Revoke any lingering tokens
    await manager.update(
      RefreshToken,
      { userId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  /**
   * Hard delete — removes the row entirely.
   * Use only when referential integrity allows it.
   */
  private async hardDeleteUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager.delete(RefreshToken, { userId });
    await manager.delete(User, { id: userId });
  }
}