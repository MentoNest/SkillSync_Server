import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/filters/validation';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { createRequestLogger } from './common/logging/request-logger.middleware';
import { DatabaseHealthService } from './database/database-health.service';
import { buildSwaggerConfig, SWAGGER_EXTRA_MODELS } from './swagger.config';
import { createShutdownMiddleware } from './shutdown/shutdown.middleware';
import { ShutdownService } from './shutdown/shutdown.service';

/** Resolves once buffered stdout has been written out (so final logs are not lost). */
function flushOutput(): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write('', () => resolve());
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Resolved after ConfigModule has loaded/validated `.env` and the environment.
  const config = app.get<AppConfig>(APP_CONFIG);

  // Graceful shutdown: stop new requests, then close the server, database and Redis.
  const shutdown = app.get(ShutdownService);
  app.use(createShutdownMiddleware(shutdown));
  shutdown.onClose(() => app.close());
  shutdown.registerHook('flush-logs', flushOutput);
  shutdown.listen();

  // Expose interactive Swagger UI at /api/docs in every environment except production.
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig(), {
      extraModels: SWAGGER_EXTRA_MODELS,
    });
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'SkillSync API Docs',
    });
  }

  // Refuse to start serving if the database does not answer.
  await app.get(DatabaseHealthService).verify();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`SkillSync API is listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error(
    `Application failed to start: ${error instanceof Error ? error.message : String(error)}`,
    'Bootstrap',
  );
  process.exit(1);
});
