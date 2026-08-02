import { Controller, Post, Delete } from '@nestjs/common';
import { SeedService } from './seed.service.js';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('demo')
  async seedDemoData() {
    return this.seedService.createDemoData();
  }

  @Delete('demo')
  async clearDemoData() {
    return this.seedService.clearDemoData();
  }
}
