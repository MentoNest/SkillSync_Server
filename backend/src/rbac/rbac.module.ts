import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { RolesController } from '../controllers/roles.controller';
import { RolesService } from '../services/roles.service';
import { Role } from '../entities/role.entity';
import { User } from '../user/entities/user.entity';
import { UserSuspension } from '../user/entities/user-suspension.entity';
import { AuditModule } from '../audit/audit.module';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { getJwtSecret } from '../config/production-security.config.js';

/**
 * #1318: role-based access control feature module.
 *
 * Owns the role catalogue (`roles` table), the `user_roles` junction managed
 * through `User.roles`, the roles API and the guard that enforces it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, User, UserSuspension]),
    // Role changes are audit logged, so the trail shows who granted what.
    AuditModule,
    // RolesGuard verifies the bearer token before reading roles from the DB.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [RolesController],
  providers: [RolesService, JwtAuthGuard, RolesGuard],
  exports: [RolesService, RolesGuard, JwtAuthGuard, TypeOrmModule],
})
export class RbacModule {}
