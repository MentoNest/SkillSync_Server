import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

export function configureSecurityHeaders(
  app: INestApplication,
  nodeEnv = process.env.NODE_ENV,
): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      frameguard: { action: 'deny' },
      hsts:
        nodeEnv === 'production'
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
      xssFilter: false,
    }),
  );
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
}
