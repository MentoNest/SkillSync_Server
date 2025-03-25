import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './users/users.module';
import { MentorModule } from './mentors/mentor.module';
import { MenteeModule } from './mentees/mentees.module';
import { ReviewModule } from './reviews/reviews.module';
import { PaymentModule } from './payments/payments.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(databaseConfig()), // Ensure it returns TypeOrmModuleOptions
    UserModule,
    MentorModule,
    MenteeModule,
    PaymentModule,
    ReviewModule,
    RedisModule,
    AuthModule,

  ],
})
export class AppModule {}
