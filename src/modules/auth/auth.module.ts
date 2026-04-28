import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletStrategy } from './strategies/wallet.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RedisModule } from '../../redis/redis.module';
import { SuspiciousLoginDetectionService } from './services/suspicious-login-detection.service';
import { SuspiciousActivityController } from './controllers/suspicious-activity.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, RefreshToken, AuditLog]),
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '24h') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, SuspiciousActivityController],
  providers: [
    AuthService,
    SuspiciousLoginDetectionService,
    JwtStrategy,
    WalletStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    TypeOrmModule,
    AuthService,
    SuspiciousLoginDetectionService,
    JwtAuthGuard,
    RolesGuard,
    PassportModule,
  ],
})
export class AuthModule {}
