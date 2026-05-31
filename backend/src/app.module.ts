import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppDataSource } from './database/data-source';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { VersionCompatibilityMiddleware } from './common/middleware/version-compatibility.middleware';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AvailabilityModule } from './availability/availability.module';
import { AvatarModule } from './avatar/avatar.module';
import { AdminModule } from './admin/admin.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MetricsMiddleware } from './monitoring/metrics.middleware';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      ...AppDataSource.options,
      retryAttempts: 5,
    }),
    AuthModule,
    UsersModule,
    AdminModule,
    RedisModule,
    HealthModule,
    PortfolioModule,
    AvailabilityModule,
    AvatarModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpLoggerMiddleware, MetricsMiddleware, VersionCompatibilityMiddleware).forRoutes('*');
  }
}
