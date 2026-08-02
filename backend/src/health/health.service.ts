import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../config/redis.module.js';

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  components: {
    database: ComponentStatus;
    redis: ComponentStatus;
    memory: MemoryStatus;
  };
}

interface ComponentStatus {
  status: 'ok' | 'error';
  responseTime?: number;
  message?: string;
}

interface MemoryStatus {
  status: 'ok' | 'warning';
  heapUsed: string;
  heapTotal: string;
  rss: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthStatus> {
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();
    const memoryStatus = this.checkMemory();

    const isHealthy =
      dbStatus.status === 'ok' && redisStatus.status === 'ok';

    return {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - this.startTime) / 1000,
      components: {
        database: dbStatus,
        redis: redisStatus,
        memory: memoryStatus,
      },
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        responseTime: Date.now() - start,
      };
    } catch (error: any) {
      this.logger.error('Database health check failed', error?.message);
      return {
        status: 'error',
        responseTime: Date.now() - start,
        message: error?.message || 'Database connection failed',
      };
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.redisService.ping();
      return {
        status: 'ok',
        responseTime: Date.now() - start,
      };
    } catch (error: any) {
      this.logger.error('Redis health check failed', error?.message);
      return {
        status: 'error',
        responseTime: Date.now() - start,
        message: error?.message || 'Redis connection failed',
      };
    }
  }

  private checkMemory(): MemoryStatus {
    const mem = process.memoryUsage();
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (mem.rss / 1024 / 1024).toFixed(2);

    return {
      status: 'ok',
      heapUsed: `${heapUsedMB}MB`,
      heapTotal: `${heapTotalMB}MB`,
      rss: `${rssMB}MB`,
    };
  }
}
