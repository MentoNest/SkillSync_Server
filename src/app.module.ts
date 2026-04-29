import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { DatabaseBackupModule } from './database/backup/database-backup.module';
import { SeedModule } from './database/seeds/seed.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ShutdownModule } from './common/services/shutdown.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),
    ScheduleModule.forRoot(),
    AppConfigModule,
    DatabaseModule.forRoot(),
    DatabaseBackupModule,
    SeedModule,
    RedisModule.forRoot(),
    AuthModule,
    UserModule,
    SessionsModule,
    HealthModule,
    ShutdownModule,
  ],
})
export class AppModule {}
