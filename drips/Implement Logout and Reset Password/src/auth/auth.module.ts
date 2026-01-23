import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenBlacklistService } from "./token-blacklist.service";
import { PasswordResetService } from "./password-reset.service";
import { RedisModule } from "../redis/redis.module";
import { UsersModule } from "../users/users.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRATION", "15m"),
        },
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    UsersModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenBlacklistService, PasswordResetService],
  exports: [AuthService, TokenBlacklistService],
})
export class AuthModule {}
