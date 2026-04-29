import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seeds/seed.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RequestContextModule } from './common/request-context.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),
    ScheduleModule.forRoot(),
    AppConfigModule,
    RequestContextModule,
    DatabaseModule.forRoot(),
    SeedModule,
    RedisModule.forRoot(),
    AuthModule,
    UserModule,
    HealthModule,
  ],
})
export class AppModule {}
