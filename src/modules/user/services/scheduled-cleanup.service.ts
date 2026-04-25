import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { AuditLog, AuditEventType } from '../../auth/entities/audit-log.entity';

@Injectable()
export class ScheduledCleanupService {
  private readonly logger = new Logger(ScheduledCleanupService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredGracePeriodUsers(): Promise<void> {
    this.logger.log('Starting cleanup of expired grace-period users...');

    const now = new Date();

    const expiredUsers = await this.userRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('user.deletedAt IS NOT NULL')
      .andWhere('user.gracePeriodEndsAt < :now', { now })
      .getMany();

    if (expiredUsers.length === 0) {
      this.logger.log('No expired grace-period users found.');
      return;
    }

    this.logger.log(`Found ${expiredUsers.length} expired grace-period user(s) to clean up.`);

    for (const user of expiredUsers) {
      try {
        await this.auditLogRepository.save(
          this.auditLogRepository.create({
            userId: user.id,
            walletAddress: user.walletAddress,
            eventType: AuditEventType.ACCOUNT_ANONYMIZED,
            ipAddress: 'system',
            metadata: {
              deletedAt: user.deletedAt,
              gracePeriodEndsAt: user.gracePeriodEndsAt,
              reason: 'grace_period_expired',
            },
          }),
        );

        await this.userRepository.remove(user);

        this.logger.log(`Permanently removed user ${user.id} (${user.walletAddress})`);
      } catch (error) {
        this.logger.error(
          `Failed to remove expired user ${user.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.log('Cleanup of expired grace-period users completed.');
  }
}
