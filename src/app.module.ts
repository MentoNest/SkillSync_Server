import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import { RedisModule } from './common/redis/redis.module';
import { UserModule } from './user/user.module';

import { AuthModule } from './auth/auth.module';

import { ProfileModule } from './profile/profile.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRoot(databaseConfig()), // Ensure it returns TypeOrmModuleOptions

    RedisModule, UserModule, AuthModule,

    TypeOrmModule.forRoot(databaseConfig()),
    RedisModule,
    UserModule,
    ProfileModule,

  ],
})
export class AppModule {}
