import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getHealth() {
    const result = await this.healthService.check();

    if (result.status === 'error') {
      return { ...result, statusCode: HttpStatus.SERVICE_UNAVAILABLE };
    }

    return result;
  }
}
