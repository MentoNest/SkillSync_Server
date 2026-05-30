import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { User } from '../entities/user.entity';
import { AuditLogService } from '../../auth/audit-log.service';
import { AuditEventType } from '../../auth/entities/audit-log.entity';

@Injectable()
export class FeaturedMentorCron {
  private readonly logger = new Logger(FeaturedMentorCron.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.debug('Running expired featured mentors cleanup job');
    
    // 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const expiredMentors = await this.userRepo.find({
      where: {
        isFeatured: true,
        featuredAt: LessThan(thirtyDaysAgo),
      },
    });

    if (expiredMentors.length === 0) {
      return;
    }

    for (const mentor of expiredMentors) {
      mentor.isFeatured = false;
      mentor.featuredAt = null;
      mentor.featuredOrder = null;
      await this.userRepo.save(mentor);

      await this.auditLogService.logEvent({
        userId: mentor.id,
        eventType: 'MENTOR_UNFEATURED' as AuditEventType,
        details: { reason: 'Expired after 30 days' },
      });
      
      this.logger.log(`Unfeatured mentor ${mentor.id} due to expiry`);
    }
  }
}
