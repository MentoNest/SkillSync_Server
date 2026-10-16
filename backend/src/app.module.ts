import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { LogoutModule } from './auth/logout.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres' as const,
        url: c.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: c.get<string>('DB_SYNCHRONIZE') === 'true',
      }),
    }),
    RedisModule,
    AuditModule,
    RbacModule,
    LogoutModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
