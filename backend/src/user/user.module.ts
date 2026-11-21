import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PortfolioLink } from './portfolio-link.entity';
import { PortfolioLinksController } from './portfolio-links.controller';
import { PortfolioLinksService } from './portfolio-links.service';
import { User } from './user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, PortfolioLink]), AuthModule],
  controllers: [UserController, PortfolioLinksController],
  providers: [UserService, PortfolioLinksService],
  exports: [UserService, PortfolioLinksService],
})
export class UserModule {}
