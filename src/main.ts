import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import { ConfigService } from './config/config.service';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
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

    // 🛡 Helmet - Enhanced security headers
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

    // 🍪 Cookie Parser with secure settings
    app.use(cookieParser());

    // 🌍 CORS via ConfigModule - Strict whitelist
    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) return callback(null, true);

        if (configService.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`🚫 CORS blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: configService.corsMethods,
      credentials: configService.corsCredentials,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
      maxAge: 600, // Cache preflight for 10 minutes
    });
    logger.log(
      `🌍 CORS configured with origins: ${configService.corsOrigins.join(', ')}`,
    );

    // 📋 Global Validation Pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Strip non-whitelisted properties
        forbidNonWhitelisted: true, // Throw error for non-whitelisted properties
        transform: true, // Automatically transform payloads to DTO instances
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // 🛡 Exception Filters
    app.useGlobalFilters(
      new ValidationExceptionFilter(),
      new HttpExceptionFilter(),
    );

    // 🔄 Global Response Interceptor
    app.useGlobalInterceptors(new TransformInterceptor());


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

    await app.listen(configService.port);

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
  } catch (error) {
    logger.error(
      '❌ Application failed to start',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
