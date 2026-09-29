import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'node:net';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule, ObserveInstrument } from './app.module.js';
import { requestLoggingMiddleware } from './common/middleware/logging.middleware.js';
import { configureSecurityHeaders } from './security/security-headers.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    // Source maps enabled for debugging — configured in tsconfig
    bufferLogs: true,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  app.use(
    helmet({
      contentSecurityPolicy: env === 'production' ? undefined : false,
    }),
  );
  app.use(requestLoggingMiddleware);
  configureSecurityHeaders(app, process.env.NODE_ENV);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const env = configService.get<string>('app.env') ?? 'development';
  const allowedCorsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  // ─── Global Pipes ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true,
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── CORS ──────────────────────────────────────────────────────────────
  app.use(createCorsOriginGuard(allowedCorsOrigins, env));
  app.enableCors(createCorsOptions(allowedCorsOrigins, env));

  // ─── Graceful Shutdown ─────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ─── API prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/live', method: RequestMethod.ALL },
    ],
  });

  // ─── OpenAPI / Swagger ─────────────────────────────────────────────────
  // The auth and user controllers already carry @ApiTags/@ApiResponse
  // metadata, but the document was never generated or served, so none of it
  // was reachable. Served at /api/docs, and only outside production.
  if (env !== 'production') {
    const openApiConfig = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription(
        'Decentralized mentorship marketplace. Wallet-based authentication, ' +
          'sessions, and user profiles.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'Bearer Auth',
      )
      .addTag('Authentication', 'Wallet challenge, login, refresh and logout')
      .addTag('Wallet', 'Stellar wallet address operations')
      .addTag('Session Management', 'Mentorship session lifecycle')
      .addTag('User', 'User profile and account management')
      .addTag('Security & Audit', 'Suspicious-activity and audit review')
      .build();

    const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup('api/docs', app, openApiDocument, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(
      '📖 OpenAPI docs available at http://localhost:' + port + '/api/docs',
    );
  }

  await app.listen(port);
  logger.log(`🚀 SkillSync server running on http://localhost:${port}/api/v1`);
  logger.log(`📌 Environment: ${env}`);
}

await bootstrap();
