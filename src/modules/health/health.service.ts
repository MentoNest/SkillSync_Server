import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { RedisService } from '../../redis/redis.service';
import { DataSource } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
    private dataSource: DataSource,
    private shutdownService: ShutdownService,
  ) {}

  async check() {
    return this.checkDetailed();
  }

  async checkDetailed() {
    // Return 503 if shutting down
    if (this.shutdownService.isShuttingDownState()) {
      throw new ServiceUnavailableException({
        status: 'shutting_down',
        message: 'Service is shutting down. Please try again later.',
        timestamp: new Date().toISOString(),
        services: {
          database: { status: 'shutting_down' },
          redis: { status: 'shutting_down' },
        },
      });
    }

    const redisHealth = await this.checkRedis();
    const databaseHealth = await this.checkDatabase();
    const diskHealth = await this.checkDisk();
    const overallStatus = this.evaluateStatus([databaseHealth, redisHealth, diskHealth]);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.nodeEnv,
      version: process.env.npm_package_version || '1.0.0',
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
      },
      services: {
        database: databaseHealth,
        redis: redisHealth,
      },
      disk: diskHealth,
    };
  }

  private evaluateStatus(components: Array<{ status: string }>) {
    return components.some((component) => component.status === 'unhealthy') ? 'unhealthy' : 'healthy';
  }

  private async checkRedis() {
    try {
      return await this.redisService.ping();
    } catch (error) {
      this.logger.error('Redis health check failed', error.stack);
      return {
        status: 'unhealthy',
        responseTime: '0ms',
        error: error.message,
      };
    }
  }

  private async checkDatabase() {
    const startTime = Date.now();

    try {
      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        connections: {
          master: this.dataSource.isInitialized ? 'connected' : 'disconnected',
        },
      };
    } catch (error) {
      this.logger.error('Database health check failed', error.stack);
      return {
        status: 'unhealthy',
        responseTime: `${Date.now() - startTime}ms`,
        error: error.message,
      };
    }
  }

  private async checkDisk() {
    const startTime = Date.now();

    if (!['linux', 'darwin', 'freebsd'].includes(process.platform)) {
      return {
        status: 'unknown',
        responseTime: `${Date.now() - startTime}ms`,
        message: `Disk health check not supported on ${process.platform}`,
      };
    }

    try {
      const { stdout } = await execFileAsync('df', ['-k', '/']);
      const responseTime = Date.now() - startTime;
      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length < 2) {
        throw new Error('Unexpected disk usage output');
      }

      const parts = lines[1].split(/\s+/);
      const [filesystem, total, used, available, usePercent, mountpoint] = parts;
      const usageValue = parseInt(usePercent?.replace('%', '') ?? '0', 10);
      const status = Number.isNaN(usageValue)
        ? 'unknown'
        : usageValue < 90
        ? 'healthy'
        : 'unhealthy';

      return {
        status,
        responseTime: `${responseTime}ms`,
        filesystem,
        total: `${total}K`,
        used: `${used}K`,
        available: `${available}K`,
        usagePercent: usePercent,
        mountpoint,
      };
    } catch (error) {
      this.logger.warn('Disk health check failed', error?.message ?? error);
      return {
        status: 'unknown',
        responseTime: `${Date.now() - startTime}ms`,
        error: error?.message ?? 'Disk check unavailable',
      };
    }
  }
}
