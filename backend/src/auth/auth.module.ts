import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '../redis/redis.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthService } from './jwt.service';
import { AuthController } from './auth.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-log.service';
import { AdminAccessGuard } from './admin-access.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { NonceProvider } from './providers/nonce.provider';
import { PaginationModule } from '../common/pagination/pagination.module';
import { SuspensionService } from './suspension.service';
import { RedisModule } from '../redis/redis.module';

import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';
import { UserSuspension } from '../users/entities/user-suspension.entity';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const alg = config.get<string>('JWT_SIGNING_ALG') || 'HS256';
        const expiresIn = config.get<string>('JWT_ACCESS_EXPIRATION') || '15m';
        const issuer = config.get<string>('JWT_ISSUER') || 'SkillSync_Server';
        const audience = config.get<string>('JWT_AUDIENCE') || 'skill-sync';
        const secretOrKey =
          alg === 'RS256'
            ? config.get<string>('JWT_PRIVATE_KEY')
            : config.get<string>('JWT_ACCESS_SECRET');

        return {
          secret: secretOrKey,
          signOptions: {
            algorithm: alg as any,
            expiresIn,
            issuer,
            audience,
          },
          verifyOptions: {
            algorithms: [alg],
            issuer,
            audience,
          },
        };
      },
    }),
  ],
  providers: [JwtAuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtAuthService],
    TypeOrmModule.forFeature([AuditLog, RefreshToken, User, Role, UserSuspension]),
    PaginationModule,
    RedisModule,
  ],
  controllers: [AuthController, AuditLogsController],
  providers: [
    AuthService,
    AuditLogService,
    AdminAccessGuard,
    JwtAuthGuard,
    RolesGuard,
    NonceProvider,
    SuspensionService,
  ],
  exports: [AuthService, AuditLogService, JwtAuthGuard, RolesGuard, SuspensionService],
})
export class AuthModule {}
