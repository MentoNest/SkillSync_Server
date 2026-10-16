import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { LogoutController } from './logout.controller';
import { LogoutService } from './logout.service';
import { TokenBlacklistService } from './token-blacklist.service';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshToken])],
  controllers: [LogoutController],
  providers: [LogoutService, TokenBlacklistService],
  exports: [TokenBlacklistService],
})
export class LogoutModule {}
