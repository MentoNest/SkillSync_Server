import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioLink } from './entities/portfolio-link.entity';
import { AdminPortfolioLinksController, PortfolioLinksController } from './portfolio-links.controller';
import { PortfolioLinksService } from './portfolio-links.service';

@Module({
  imports: [TypeOrmModule.forFeature([PortfolioLink])],
  controllers: [PortfolioLinksController, AdminPortfolioLinksController],
  providers: [PortfolioLinksService],
  exports: [PortfolioLinksService],
})
export class PortfolioLinksModule {}
