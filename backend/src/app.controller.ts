import { Controller, Get, HttpCode, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ShutdownService } from './shutdown/shutdown.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
    private readonly shutdownService: ShutdownService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @HttpCode(200)
  async health(@Res() res: Response) {
    if (this.shutdownService.isShuttingDown()) {
      return res.status(503).json({
        status: 'shutting_down',
        message: 'Service is shutting down',
      });
    }

    const checks: Record<string, string> = { http: 'ok' };

    try {
      await this.redisService.get('health');
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks });
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

  @Get('protected')
  @UseGuards(JwtAuthGuard)
  getProtected(@Req() req: Request) {
    return { status: 'ok', user: req.user };
  }
}