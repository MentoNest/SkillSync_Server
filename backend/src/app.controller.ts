import { Controller, Get, HttpCode, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
 feat/refresh-token
import type { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
 main
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ShutdownService } from './shutdown/shutdown.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
    private readonly shutdownService: ShutdownService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Root health probe', description: 'Returns "Hello World!" to confirm the service is up.' })
  @ApiResponse({ status: 200, description: 'Service is running', schema: { type: 'string', example: 'Hello World!' } })
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
  @ApiOperation({ summary: 'Redis connectivity check' })
  @ApiResponse({ status: 200, description: 'Redis is reachable', schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 200, description: 'Redis error (still 200 but status=error)', schema: { example: { status: 'error', message: 'Connection refused' } } })
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
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'JWT-protected probe', description: 'Returns the decoded JWT payload for a valid token.' })
  @ApiResponse({ status: 200, description: 'Valid JWT', schema: { example: { status: 'ok', user: {} } } })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  getProtected(@Req() req: Request) {
 return { status: 'ok', user: (req as any).user };
  }
}
