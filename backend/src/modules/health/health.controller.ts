import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'connected' | 'disconnected';
  uptime: number;
}

/**
 * Health check endpoint used to verify the app and DB are up.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<HealthStatus> {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    const response: HealthStatus = {
      status: dbStatus === 'connected' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptime: process.uptime(),
    };

    if (dbStatus === 'disconnected') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
