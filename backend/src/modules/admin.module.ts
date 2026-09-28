import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity.js';
import { AuditLog } from '../auth/entities/audit-log.entity.js';
import { Role } from '../entities/role.entity.js';
import { MentorProfile } from '../entities/mentor-profile.entity.js';
import { AdminDashboardService } from '../services/admin-dashboard.service.js';
import { FeaturedMentorService } from '../services/featured-mentor.service.js';
import { AdminController } from '../controllers/admin.controller.js';
import { MentorsController } from '../controllers/mentors.controller.js';
import { UserModule } from '../user/user.module.js';
import { AuditModule } from '../audit/audit.module.js';

/**
 * Registers the AdminController, the public MentorsController, and their
 * supporting services:
 *  - AdminDashboardService  — dashboard stats, user management, moderation.
 *  - FeaturedMentorService  — #1346 feature / unfeature admin actions and
 *                             the public GET /mentors/featured listing.
 *  - ProfileCompletenessService is imported transitively via UserModule.
 *  - AuditService is imported transitively via AuditModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuditLog, Role, MentorProfile]),
    // UserModule exports UserService (account lifecycle) and ProfileCompletenessService.
    UserModule,
    // AuditModule exports AuditService so FeaturedMentorService can write audit entries.
    AuditModule,
  ],
  controllers: [AdminController, MentorsController],
  providers: [AdminDashboardService, FeaturedMentorService],
  exports: [AdminDashboardService, FeaturedMentorService],
})
export class AdminModule {}
