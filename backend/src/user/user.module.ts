import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UserController } from './user.controller.js';
import { UsersController } from './users.controller.js';
import { ProfileLookupController } from './profile-lookup.controller.js';
import { UserService } from './user.service.js';
import { User } from './entities/user.entity.js';
import { UserSuspension } from './entities/user-suspension.entity.js';
import { Role } from '../entities/role.entity.js';
import { MentorProfile } from '../entities/mentor-profile.entity.js';
import { MenteeProfile } from '../entities/mentee-profile.entity.js';
import { AvailabilitySlot } from '../entities/availability-slot.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { AuditLog } from '../auth/entities/audit-log.entity.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProfileCompletenessService } from './services/profile-completeness.service.js';

@Module({
  imports: [
    // #1174: RefreshToken/AuditLog registered here too so UserService can
    // invalidate sessions and write audit entries for account lifecycle
    // actions (soft delete/restore/admin status changes) directly.
    // #1175: UserSuspension registered so UserService/RolesGuard can read
    // and manage suspension records.
    TypeOrmModule.forFeature([User, Role, MentorProfile, MenteeProfile, AvailabilitySlot, UserSuspension, RefreshToken, AuditLog]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    // Provides RedisService (exported by AuthModule) for user search caching.
    // forwardRef on both sides resolves the Auth <-> User circular dependency.
    forwardRef(() => AuthModule),
  ],
  // #1177: ProfileLookupController serves GET /profiles/:idOrUsername
  controllers: [UserController, UsersController, ProfileLookupController],
  providers: [UserService, ProfileCompletenessService, RolesGuard],
  exports: [UserService, ProfileCompletenessService, TypeOrmModule],
})
export class UserModule {}