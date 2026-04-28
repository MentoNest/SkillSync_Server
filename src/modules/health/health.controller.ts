import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  getHealth() {
    return this.healthService.check();
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Get detailed health status' })
  @ApiResponse({ status: 200, description: 'Detailed health information' })
  getDetailedHealth() {
    return this.healthService.checkDetailed();
  }
}
