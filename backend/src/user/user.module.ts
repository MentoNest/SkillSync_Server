import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProfileCompletenessModule } from '../profile/profile-completeness.module';
import { PortfolioLink } from './portfolio-link.entity';
import { PortfolioLinksController } from './portfolio-links.controller';
import { PortfolioLinksService } from './portfolio-links.service';
import { RoleEntity } from './role.entity';
import { User } from './user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, RoleEntity, PortfolioLink]), AuthModule],
  imports: [TypeOrmModule.forFeature([User, RoleEntity, PortfolioLink]), AuthModule, ProfileCompletenessModule],
  controllers: [UserController, PortfolioLinksController],
  providers: [UserService, PortfolioLinksService],
  exports: [UserService, PortfolioLinksService],
})
export class UserModule {}
