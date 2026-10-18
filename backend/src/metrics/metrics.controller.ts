import {
  Controller,
  Get,
  Headers,
  ForbiddenException,
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { renderMetrics } from './metrics.registry';

/**
 * Prometheus scrape endpoint (#1473).
 * Secured with Basic auth and/or IP allow-list when configured.
 */
@Controller()
export class MetricsController {
  constructor(private readonly config: ConfigService) {}

  @Get('metrics')
  metrics(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Headers('authorization') authorization?: string,
  ): void {
    this.assertAllowed(req, authorization);
    const body = renderMetrics() + '\n';
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(body);
  }

  private assertAllowed(req: Request, authorization?: string): void {
    const allowedIps = (this.config.get<string>('METRICS_ALLOWED_IPS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const user = this.config.get<string>('METRICS_BASIC_AUTH_USER');
    const pass = this.config.get<string>('METRICS_BASIC_AUTH_PASS');

    if (allowedIps.length > 0) {
      const ip = req.ip ?? req.socket?.remoteAddress ?? '';
      const ok = allowedIps.some((a) => ip === a || ip.endsWith(a) || ip.includes(a));
      if (!ok) throw new ForbiddenException('metrics scrape not allowed from this IP');
    }

    if (user && pass) {
      if (!authorization?.startsWith('Basic ')) {
        throw new UnauthorizedException('metrics basic auth required');
      }
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const [u, p] = decoded.split(':');
      if (u !== user || p !== pass) {
        throw new UnauthorizedException('invalid metrics credentials');
      }
    }
  }
}
