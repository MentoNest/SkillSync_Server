import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { PortfolioLink } from './entities/portfolio-link.entity';
import { PortfolioLinksService } from './portfolio-links.service';
import { AuditLogService } from '../auth/audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, PortfolioLink])],
  controllers: [UsersController],
  providers: [UsersService, AuditLogService, PortfolioLinksService],
  exports: [UsersService, PortfolioLinksService],
})
export class UsersModule {}
