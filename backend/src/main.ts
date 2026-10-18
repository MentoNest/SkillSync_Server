import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildCorsOptions } from './config/cors.config';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  registerGracefulShutdown,
  rejectDuringShutdown,
} from './shutdown/graceful-shutdown';
import { ShutdownService } from './shutdown/shutdown.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // #1480 - request id on every request (header, logs, DB comments)
  app.use(requestLoggingMiddleware);

  // #1483 - refuse new requests once shutdown has begun
  const shutdown = app.get(ShutdownService);
  app.use(rejectDuringShutdown(shutdown));
  const isProd = (config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production';

  // #1469 — Trust proxy when behind Nginx / Cloudflare
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy === 'true' || trustProxy === '1') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  } else if (trustProxy && !Number.isNaN(Number(trustProxy))) {
    app.getHttpAdapter().getInstance().set('trust proxy', Number(trustProxy));
  }

  // #1470 / #1469 — Security headers (Helmet)
  app.use(
    helmet({
      xPoweredBy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: [
            "'self'",
            ...(config.get<string>('CSP_CONNECT_SRC')?.split(',').filter(Boolean) ?? []),
          ],
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
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // #1471 / #1469 — CORS whitelist from env
  app.enableCors(buildCorsOptions(config));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // #1469 — Swagger only outside production (or when explicitly enabled)
  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED') === 'true' || !isProd;
  if (swaggerEnabled && !isProd) {
    const doc = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription('SkillSync backend')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
    logger.log('Swagger UI available at /docs');
  } else if (isProd) {
    logger.log('Swagger UI disabled in production');
  }

  // Cookie defaults for any cookie-based flows (#1469)
  // Consumers should use: { httpOnly: true, secure: isProd, sameSite: 'strict' }
  (app.getHttpAdapter().getInstance() as { locals?: Record<string, unknown> }).locals = {
    cookieDefaults: {
      httpOnly: true,
      secure: isProd || config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'strict' as const,
    },
  };

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  // #1483 - SIGTERM/SIGINT: drain in-flight requests, close DB/Redis, exit
  app.enableShutdownHooks();
  registerGracefulShutdown({
    app,
    shutdown,
    timeoutMs: Number(config.get<string>('SHUTDOWN_TIMEOUT_MS') ?? DEFAULT_SHUTDOWN_TIMEOUT_MS),
  });
  logger.log(`SkillSync API listening on :${port} (NODE_ENV=${config.get('NODE_ENV') ?? 'development'})`);
}

bootstrap();
