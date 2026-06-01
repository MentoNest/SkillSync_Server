import { Controller, Get, Version } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Version('1')
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Version('2')
  @Get()
  getHelloV2(): string {
    return 'Hello from V2!';
  }
}
