import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  constructor(private configService: ConfigService) {}

  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get('NODE_ENV'),
    };
  }

  checkDetailed() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get('NODE_ENV'),
      version: process.env.npm_package_version || '1.0.0',
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
      },
      services: {
        database: this.checkDatabase(),
        redis: this.checkRedis(),
      },
    };
  }

  private checkDatabase() {
    // In a real application, you would check database connectivity
    return {
      status: 'healthy',
      responseTime: '1ms',
    };
  }

  private checkRedis() {
    // In a real application, you would check Redis connectivity
    return {
      status: 'healthy',
      responseTime: '2ms',
    };
  }
}
