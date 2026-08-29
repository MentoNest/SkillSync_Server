import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GracefulShutdownService } from './common/shutdown/graceful-shutdown.service';
import { EncryptionService } from './common/encryption/encryption.service';
import { BackupService } from './common/backup/backup.service';
import { requestLoggingMiddleware } from './common/middleware/logging.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ValidationException } from './common/exceptions/validation.exception';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // #1141: verify the database connection before accepting any traffic.
  // TypeOrmModule.forRootAsync (see app.module.ts) already retries the
  // initial connection (DB_MAX_RETRIES, default 5) during module init, which
  // runs as part of NestFactory.create() above — this check fails startup
  // fast and loudly if that connection never came up.
  const dataSource = app.get(DataSource);
  if (!dataSource.isInitialized) {
    logger.error(
      'Database connection could not be established. Aborting startup.',
    );
    await app.close();
    process.exit(1);
  }
  logger.log('Database connection verified.');

  // Trust proxy settings (for Nginx/CloudFlare reverse proxies)
  if (
    process.env.TRUST_PROXY === 'true' ||
    process.env.NODE_ENV === 'production'
  ) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // #1143: global request logging middleware — generates/propagates the
  // request ID and logs method/path/status/duration/IP/user agent for every
  // request. Applied globally via app.use() so it wraps the entire pipeline,
  // including requests that never reach a controller.
  app.use(requestLoggingMiddleware);

  // #1144: centralized exception filter — every error response (known
  // HttpExceptions and unexpected errors alike) is normalized to
  // { statusCode, message, error, timestamp, path, requestId }.
  app.useGlobalFilters(new GlobalExceptionFilter());

  // API Versioning - URI path strategy
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // Global validation pipe. A custom exceptionFactory turns class-validator's
  // ValidationError[] into a ValidationException (#1144) so the exception
  // filter can format it as `{ field, errors[] }[]` instead of a flat array
  // of strings.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: (errors) => new ValidationException(errors),
    }),
  );

  // Enable CORS
  app.enableCors();

  // Initialize graceful shutdown
  const shutdownService = app.get(GracefulShutdownService);
  shutdownService.initialize(app);

  // Initialize encryption service
  try {
    const encryptionService = app.get(EncryptionService);
    logger.log('Encryption service initialized');
  } catch (error) {
    logger.warn('Encryption service not available');
  }

  // Initialize backup service and start automated backups
  try {
    const backupService = app.get(BackupService);
    backupService.startAutomatedBackups();
    logger.log('Backup service initialized with automated backups');
  } catch (error) {
    logger.warn('Backup service not available');
  }

  // Swagger OpenAPI Documentation
  const isProduction = process.env.NODE_ENV === 'production';
  const enableSwagger = !isProduction || process.env.ENABLE_SWAGGER === 'true';

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
        return callback(null, true);
      }
      if (!isProduction && origin.startsWith('http://localhost')) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Request-ID'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: isProduction ? ([] as any) : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Swagger OpenAPI Documentation
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription(
        'SkillSync Backend API Documentation. Complete endpoints for Authentication, Wallet Verification, Session Revocation, User Profiles, and Security Monitoring.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT Bearer token',
          in: 'header',
        },
        'Bearer Auth',
      )
      .addTag(
        'Authentication',
        'Core user authentication, token issuance, and refresh flows',
      )
      .addTag(
        'Wallet',
        'Web3 Ethereum wallet cryptographic nonce challenge and signature verification',
      )
      .addTag(
        'Session Management',
        'Device session revocation and logout operations',
      )
      .addTag(
        'User',
        'User accounts, profile management (mentor/mentee), and settings',
      )
      .addTag(
        'Security & Audit',
        'Suspicious activity detection and security dashboard',
      )
      .addTag(
        'Roles',
        'Role-based access control and administrative permissions',
      )
      .addTag('Admin', 'Admin dashboard and platform management')
      .addTag('Notifications', 'User notification system')
      .addTag('Health', 'System health and backup status')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
      customSiteTitle: 'SkillSync API Docs',
    });
  } else {
    // Protect Swagger UI with basic auth in production if explicitly enabled
    logger.log('Swagger UI disabled in production mode');
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
  logger.log(`API versioning enabled: /api/v1/...`);
  if (enableSwagger) {
    logger.log(
      `Swagger documentation available at http://localhost:${port}/api/docs`,
    );
  }
}
bootstrap();
