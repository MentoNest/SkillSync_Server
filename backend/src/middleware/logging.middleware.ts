import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { redact } from '../utils/redact';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { ip, method, originalUrl, body, headers } = req;
    const userAgent = req.get('user-agent') || '';
    const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();

    const start = process.hrtime();

    res.on('finish', () => {
      const end = process.hrtime(start);
      const duration = (end[0] * 1e9 + end[1]) / 1e6;
      const { statusCode } = res;

      const redactedBody = redact(body, ['password', 'token']);
      const redactedHeaders = redact(headers, ['authorization']);

      const log = {
        requestId,
        method,
        url: originalUrl,
        statusCode,
        ip,
        userAgent,
        duration: `${duration.toFixed(2)}ms`,
        body: redactedBody,
        headers: redactedHeaders,
      };

      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`${method} ${originalUrl} ${statusCode} - ${duration.toFixed(2)}ms`);
      } else {
        if (statusCode >= 500) {
          this.logger.error(JSON.stringify(log));
        } else if (statusCode >= 400) {
          this.logger.warn(JSON.stringify(log));
        } else {
          this.logger.log(JSON.stringify(log));
        }
      }
    });

    next();
  }
}