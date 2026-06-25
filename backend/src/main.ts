import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

import { LoggingMiddleware } from './middleware/logging.middleware';
import { RequestIdMiddleware } from './exceptions/request-id.middleware';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { ShutdownService } from './shutdown/shutdown.service';

const SHUTDOWN_TIMEOUT_MS = 30_000;
const logger = new Logger('Bootstrap');
import { setupSwagger } from './swagger/swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const loggingMiddleware = new LoggingMiddleware();
  const requestIdMiddleware = new RequestIdMiddleware();

  app.use(loggingMiddleware.use.bind(loggingMiddleware));
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => errors,
    }),
  );

  // Enable NestJS lifecycle shutdown hooks (OnModuleDestroy, etc.)
  app.enableShutdownHooks();
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
