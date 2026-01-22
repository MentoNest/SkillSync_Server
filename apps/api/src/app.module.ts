import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { ListingsModule } from './listings/listings.module';

@Module({
  imports: [DatabaseModule, HealthModule, ListingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
