import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildCorsOptions } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProd = config.get<string>('NODE_ENV') === 'production';

  // #1470 — Security headers (Helmet)
  app.use(
    helmet({
      // Hide technology stack
      xPoweredBy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...(config.get<string>('CSP_CONNECT_SRC')?.split(',').filter(Boolean) ?? [])],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
      hsts: isProd
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Explicitly ensure X-Powered-By is gone even if a proxy re-adds defaults
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // #1471 — CORS
  app.enableCors(buildCorsOptions(config));

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(`SkillSync API listening on :${port}`);
}

bootstrap();
