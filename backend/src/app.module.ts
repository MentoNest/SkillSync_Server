import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { VerificationModule } from './verification/verification.module.js';
import { PaginationModule } from './common/pagination/pagination.module.js';
import { RedisModule } from './config/redis.module.js';
import { MentorsModule } from './mentors/mentors.module.js';
import typeOrmConfig from './config/typeorm.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    RedisModule.forRoot(),
    PaginationModule,
    UsersModule,
    AuthModule,
    AvailabilityModule,
    VerificationModule,
    MentorsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
