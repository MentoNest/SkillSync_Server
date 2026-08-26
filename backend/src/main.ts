import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Trust proxy settings (for Nginx/CloudFlare reverse proxies)
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS configuration
  const isProduction = process.env.NODE_ENV === 'production';
  const enableSwagger = !isProduction || process.env.ENABLE_SWAGGER === 'true';

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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
  app.use(helmet({
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
        upgradeInsecureRequests: isProduction ? [] as any : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

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
      .addTag('Authentication', 'Core user authentication, token issuance, and refresh flows')
      .addTag('Wallet', 'Web3 Ethereum wallet cryptographic nonce challenge and signature verification')
      .addTag('Session Management', 'Device session revocation and logout operations')
      .addTag('User', 'User accounts, profile management (mentor/mentee), and settings')
      .addTag('Security & Audit', 'Suspicious activity detection and security dashboard')
      .addTag('Roles', 'Role-based access control and administrative permissions')
      .addTag('Health', 'Application health checks and dependency status')
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
  if (enableSwagger) {
    logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
