import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/redis')
  async redisHealth() {
    try {
      await this.redisService.get('health');
      return { status: 'ok' };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }
}