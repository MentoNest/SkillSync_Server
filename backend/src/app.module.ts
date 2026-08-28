import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './user/entities/user.entity';
import { Role } from './entities/role.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { AuditLog } from './auth/entities/audit-log.entity';
import { Notification } from './entities/notification.entity';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './services/roles.service';
import { UserService } from './services/user.service';
import { AuditLogService } from './services/audit-log.service';
import { RedisService } from './services/redis.service';
import { RolesController } from './controllers/roles.controller';
import { UserController } from './controllers/user.controller';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SessionModule } from './session/session.module';
import { ChatModule } from './chat/chat.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuditLogsController } from './controllers/audit-logs.controller';
import { EncryptionModule } from './common/encryption/encryption.module';
import { BackupModule } from './common/backup/backup.module';
import { GracefulShutdownModule } from './common/shutdown/graceful-shutdown.module';
import { ContractTestingModule } from './common/contract-testing/contract-testing.module';
import { ApiVersioningModule } from './common/versioning/api-versioning.module';
import { NotificationModule } from './modules/notification.module';
import { AdminModule } from './modules/admin.module';
import { HealthController } from './controllers/health.controller';
import {
  getDatabaseConfig,
  getDatabaseRetryConfig,
} from './config/database.config';

@Module({
  imports: [
    // #1141: env-driven config, auto-loaded entities, retry logic, pooling,
    // SSL and slow-query logging live in ./config/database.config.ts so the
    // TypeORM CLI (src/data-source.ts) shares the exact same settings.
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...getDatabaseConfig(),
        // Nest-specific extras layered on top of the shared DataSourceOptions.
        autoLoadEntities: true,
        ...getDatabaseRetryConfig(),
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Role,
      RefreshToken,
      AuditLog,
      Notification,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    UserModule,
    AuthModule,
    EncryptionModule,
    BackupModule,
    GracefulShutdownModule,
    ContractTestingModule,
    ApiVersioningModule,
    NotificationModule,
    AdminModule,
  ],
  controllers: [
    AppController,
    RolesController,
    AuditLogsController,
    HealthController,
  ],
  providers: [
    AppService,
    RolesService,
    RolesGuard,
    AuditLogService,
    RedisService,
  ],
  exports: [RedisService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly rolesService: RolesService) {}

  async onModuleInit() {
    await this.rolesService.initializeDefaultRoles();
  }
}
