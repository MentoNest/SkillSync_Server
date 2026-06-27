import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Application health check' })
  @ApiResponse({ status: 200, description: 'All services healthy' })
  @ApiResponse({ status: 503, description: 'One or more services unavailable' })
  async check(@Res() res: Response) {
    const result: Record<string, any> = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      status: 'ok',
      services: {},
    };

    try {
      await this.dataSource.query('SELECT 1');
      result.services.database = 'ok';
    } catch {
      result.services.database = 'unavailable';
      result.status = 'degraded';
    }

    const mem = process.memoryUsage();
    result.services.memory = {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    };

    const code = result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(code).json(result);
  }
}
