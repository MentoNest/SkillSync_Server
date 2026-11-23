import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type Application } from 'express';
import { resolve } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/filters/validation';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { createRequestLogger } from './common/logging/request-logger.middleware';
import { createRateLimitMiddleware } from './common/security/rate-limit.middleware';
import { DatabaseHealthService } from './database/database-health.service';
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

  (app.getHttpAdapter().getInstance() as Application).set(
    'trust proxy',
    config.trustProxy,
  );
  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });
  app.use(createRequestLogger());
  app.use(createRateLimitMiddleware(config.rateLimit));
  (app.getHttpAdapter().getInstance() as Application).use(
    process.env.CHAT_UPLOAD_PUBLIC_PATH ?? '/uploads/chat',
    express.static(resolve(process.env.CHAT_UPLOAD_DIR ?? 'uploads/chat')),
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(config.isProduction));
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Graceful shutdown: stop new requests, then close the server, database and Redis.
  const shutdown = app.get(ShutdownService);
  app.use(createShutdownMiddleware(shutdown));
  shutdown.onClose(() => app.close());
  shutdown.registerHook('flush-logs', flushOutput);
  shutdown.listen();

  // Expose interactive Swagger UI at /api/docs in every environment except production.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription(
        'REST API for the SkillSync platform. ' +
          'Authentication is wallet-based (Stellar ED25519): request a nonce, sign it, exchange the signature for JWT tokens.',
      )
      .setVersion('1.0')
      .addTag('Authentication', 'Wallet login and token lifecycle endpoints.')
      .addTag('Wallet', 'Nonce issuance for Stellar wallet sign-in.')
      .addTag('Session Management', 'Token refresh and revocation.')
      .addTag('Users', 'Username, display name, and public profile endpoints.')
      .addTag('Profiles', 'Mentor and mentee profile creation and management.')
      .addTag('Admin', 'Admin-only endpoints. Require the ADMIN role.')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Paste the accessToken returned by POST /auth/login. ' +
            'Format: Bearer <token>',
          name: 'Authorization',
          in: 'header',
        },
        'Bearer Auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
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
