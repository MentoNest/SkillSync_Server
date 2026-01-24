import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('cached-data')
  @UseInterceptors(CacheInterceptor)
  getCachedData(): { timestamp: string; message: string } {
    return {
      timestamp: new Date().toISOString(),
      message: 'This endpoint response is cached for 5 minutes',
    };
  }
}
