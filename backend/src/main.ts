import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, VersioningType  } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import * as express from 'express';
import helmet from 'helmet';

import { LoggingMiddleware } from './middleware/logging.middleware';
import { RequestIdMiddleware } from './exceptions/request-id.middleware';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { RequestIdInterceptor } from './exceptions/request-id.interceptor';
import { ShutdownService } from './shutdown/shutdown.service';
import { MetricsInterceptor } from './metrics/metrics.interceptor';

const SHUTDOWN_TIMEOUT_MS = 30_000;
const logger = new Logger('Bootstrap');
import { setupSwagger } from './swagger/swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const metricsInterceptor = app.get(MetricsInterceptor);
  app.useGlobalInterceptors(metricsInterceptor);

  const loggingMiddleware = new LoggingMiddleware();
  const requestIdMiddleware = new RequestIdMiddleware();

  app.useWebSocketAdapter(new IoAdapter(app));
  // Security: enable HTTP headers via Helmet
  app.use(helmet());

  // CORS: strict whitelist from `CORS_ALLOWED_ORIGINS` (comma-separated)
  const rawCors = process.env.CORS_ALLOWED_ORIGINS || '';
  const corsWhitelist = rawCors.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsWhitelist.length === 0) return callback(new Error('CORS not configured'), false);
      return callback(null, corsWhitelist.includes(origin));
    },
    credentials: true,
  });
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.use(loggingMiddleware.use.bind(loggingMiddleware));
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => errors,
    }),
  );

  // Enable NestJS lifecycle shutdown hooks (OnModuleDestroy, etc.)
  app.enableShutdownHooks();
  // Fail fast in production if critical secrets are missing
  if (process.env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!process.env.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY');
    if (!process.env.ENCRYPTION_HMAC_KEY) missing.push('ENCRYPTION_HMAC_KEY');
    if (missing.length) {
      logger.error(`Missing required environment variables for production: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  // OpenAPI / Swagger UI (disabled in production via env flag)
  if (process.env.SWAGGER_ENABLED !== 'false') {
    setupSwagger(app);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);

  const shutdownService = app.get(ShutdownService);

  async function gracefulShutdown(signal: string) {
    logger.log(`Received ${signal} – starting graceful shutdown`);

    // Mark service as shutting down so health check returns 503
    shutdownService.initiateShutdown();

    // Force-exit after timeout to avoid hanging forever
    const forceExitTimer = setTimeout(() => {
      logger.error(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms – forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      // Stop accepting new HTTP connections and wait for in-flight requests to finish
      await app.close();
      logger.log('Application closed cleanly');
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err);
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap();
