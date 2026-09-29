import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../user/entities/user.entity';
import { UserSuspension } from '../user/entities/user-suspension.entity';
import { Role } from '../entities/role.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { getJwtSecret } from '../config/production-security.config.js';

/**
 * #1320: audit trail feature module.
 *
 * Registers the canonical `AuditLog` entity and exposes the admin-only
 * read/retention endpoints. `AuditService` is exported so other feature
 * modules (auth, RBAC, admin) can record events without duplicating the
 * repository wiring.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User, Role, UserSuspension]),
    // JwtService is required by RolesGuard to verify the bearer token.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuditController],
  providers: [AuditService, JwtAuthGuard, RolesGuard],
  exports: [AuditService, TypeOrmModule],
})
export class AuditModule {}
