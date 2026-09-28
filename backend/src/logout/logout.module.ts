import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { LogoutController } from './logout.controller';
import { LogoutService } from './logout.service';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * #1317: logout feature module.
 *
 * `SecurityModule` is global, so the token blacklist is injected without an
 * explicit import; `AuditModule` is imported for the logout audit trail.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, User]),
    AuditModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [LogoutController],
  providers: [LogoutService, JwtAuthGuard],
  exports: [LogoutService],
})
export class LogoutModule {}
