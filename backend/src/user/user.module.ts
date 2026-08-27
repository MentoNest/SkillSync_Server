import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UserController } from './user.controller';
import { UsersController } from './users.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { Role } from '../entities/role.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { RolesGuard } from '../guards/roles.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, MentorProfile]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    // Provides RedisService (exported by AuthModule) for user search caching.
    // forwardRef on both sides resolves the Auth <-> User circular dependency.
    forwardRef(() => AuthModule),
  ],
  controllers: [UserController, UsersController],
  providers: [UserService, RolesGuard],
  exports: [UserService, TypeOrmModule],
})
export class UserModule {}
