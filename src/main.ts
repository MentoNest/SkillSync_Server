import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from './config/config.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { DataSource } from 'typeorm';
import { AdminSeedService } from './database/seeds/admin-seed.service';
import { CorsConfig } from './config/cors.config';
import { ShutdownService } from './common/services/shutdown.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);

  // 🔐 Validate secrets in production
  if (configService.isProduction) {
    logger.log('🔒 Production mode detected - validating secrets...');
    configService.validateSecrets();
  }

  // 🔐 Disable x-powered-by
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // 🔒 Trust Proxy - Enable when behind reverse proxy
  if (configService.trustProxy) {
    logger.log('🔒 Trust proxy enabled for reverse proxy (Nginx/CloudFlare)');
    app.set('trust proxy', true);
  }

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: configService.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: configService.isProduction ? undefined : false,
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    }),
  );
  logger.log('🛡 Helmet security headers enabled');

  app.use(compression());

  // Request logging middleware
  app.use(new RequestLoggerMiddleware().use);

  // 🍪 Cookie Parser with secure settings
  app.use(cookieParser());

  // 🌍 CORS Configuration via ConfigModule - Strict whitelist with preflight handling
  const corsOptions = CorsConfig.getCorsOptions(
    configService.corsOrigins,
    configService.corsMethods,
    configService.corsCredentials,
    !configService.isProduction,
  );

  app.enableCors(corsOptions);

  const allowedOriginsList = configService.corsOrigins.join(', ');
  logger.log(
    `🌍 CORS enabled with origins: ${allowedOriginsList || '(none configured)'}`,
  );
  logger.log(`🌍 CORS methods: ${configService.corsMethods.join(', ')}`);
  logger.log(
    `🌍 CORS credentials: ${configService.corsCredentials ? 'enabled' : 'disabled'}`,
  );
  logger.log(`🌍 CORS preflight cache: ${configService.corsPrefflightMaxAge}s`);

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global response envelope
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  // Global validation pipe with custom error formatting
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((error) => {
          const constraints = error.constraints
            ? Object.values(error.constraints)
            : [];
          return constraints.map((message) => `${error.property} ${message}`);
        });

        return new BadRequestException({
          message: messages,
          error: 'Bad Request',
        });
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix(configService.get<string>('API_PREFIX') || 'api');

  // 📚 Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription('The SkillSync API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Disable or protect Swagger in production
  if (configService.isProduction) {
    const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';
    if (!swaggerEnabled) {
      logger.log('📚 Swagger UI disabled in production');
    } else {
      SwaggerModule.setup('api-docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
        },
        customSiteTitle: 'SkillSync API Docs (Production)',
      });
      logger.log(
        '📚 Swagger UI enabled at /api-docs (PRODUCTION - ensure access is restricted)',
      );
    }
  } else {
    // Development - Swagger enabled
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
      customSiteTitle: 'SkillSync API Docs (Development)',
    });
    logger.log('📚 Swagger UI enabled at /api-docs (Development)');
  }

  // 🚦 Global Rate Limiting will be applied via guards on individual routes
  if (configService.rateLimitEnabled) {
    logger.log('✅ Global rate limiting available via guards');
  } else {
    logger.log('⚠️  Global rate limiting disabled');
  }

  // Verify database connection before starting server
  try {
    const dataSource = app.get(DataSource);
    if (dataSource.isInitialized) {
      logger.log('Database connection verified successfully');
    }
  } catch (error) {
    logger.error('Failed to verify database connection:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }

  // Run admin seed
  try {
    const adminSeedService = app.get(AdminSeedService);
    const seedResult = await adminSeedService.seed();
    logger.log(`[Seed] ${seedResult.message}`);
  } catch (error) {
    logger.error(`Failed to run admin seed: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
    // Don't exit on seed failure - application can still run
  }

  // Add shutdown service to app context
  const shutdownService = app.get(ShutdownService);
  const httpServer = app.getHttpServer();
  shutdownService.setHttpServer(httpServer);

  await app.listen(configService.port);

  // Setup graceful shutdown handlers
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  
  // Handler function to be registered for both signals
  const shutdownHandler = async (signal: NodeJS.Signals) => {
    logger.log(`Received ${signal} signal`);
    // Remove all signal listeners to prevent duplicate shutdowns
    signals.forEach(s => process.removeAllListeners(s));
    await shutdownService.gracefulShutdown(signal);
  };
  
  for (const signal of signals) {
    process.on(signal, shutdownHandler);
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error instanceof Error ? error.stack : String(error));
    // Don't shutdown on uncaught exceptions - let the app continue
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't shutdown on unhandled rejections - let the app continue
  });

  // Log production configuration summary
  if (configService.isProduction) {
    logger.log('═══════════════════════════════════════════');
    logger.log('🔒 PRODUCTION SECURITY CONFIGURATION');
    logger.log('═══════════════════════════════════════════');
    logger.log(`✓ NODE_ENV: ${configService.nodeEnv}`);
    logger.log(`✓ Trust Proxy: ${configService.trustProxy ? 'Enabled' : 'Disabled'}`);
    logger.log(`✓ Helmet: Enabled with HSTS`);
    logger.log(`✓ CORS Origins: ${configService.corsOrigins.length} whitelist(s)`);
    logger.log(`✓ Cookie Security: Secure=${configService.cookieSecure}, HttpOnly=${configService.cookieHttpOnly}, SameSite=${configService.cookieSameSite}`);
    logger.log(`✓ Rate Limiting: ${configService.rateLimitPerUserMax} req/min (authenticated), ${configService.rateLimitPerIpMax} req/min (unauthenticated)`);
    logger.log(`✓ Swagger UI: ${process.env.SWAGGER_ENABLED === 'true' ? 'Enabled (RESTRICTED)' : 'Disabled'}`);
    logger.log('═══════════════════════════════════════════');
  }

  logger.log(`🚀 Server is running on http://localhost:${configService.port}`);
  logger.log(`API documentation available at: http://localhost:${configService.port}/api-docs`);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
