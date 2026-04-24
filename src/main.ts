import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { DataSource } from 'typeorm';
import { AdminSeedService } from './database/seeds/admin-seed.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);

  // Security middleware
  app.use(helmet());
  app.use(compression());

  // Request logging middleware
  app.use(new RequestLoggerMiddleware().use);

  // CORS configuration
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global logging interceptor (removed in favor of structured request logger middleware)
  // app.useGlobalInterceptors(new LoggingInterceptor());

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
        const messages = errors.map((error) => {
          const constraints = error.constraints
            ? Object.values(error.constraints)
            : [];
          return `${error.property} ${constraints.join(', ')}`;
        });
        return new Error(messages.join(', '));
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix(configService.get<string>('API_PREFIX') || 'api');

  // Swagger documentation
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription('Enterprise-level API for SkillSync platform')
      .setVersion('1.0')
      .addTag('Authentication')
      .addTag('Wallet')
      .addTag('Session Management')
      .addTag('Users')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Verify database connection before starting server
  try {
    const dataSource = app.get(DataSource);
    if (dataSource.isInitialized) {
      console.log('Database connection verified successfully');
    }
  } catch (error) {
    console.error('Failed to verify database connection:', error.message);
    process.exit(1);
  }

  // Run admin seed
  try {
    const adminSeedService = app.get(AdminSeedService);
    const seedResult = await adminSeedService.seed();
    console.log(`[Seed] ${seedResult.message}`);
  } catch (error) {
    const logger = new Logger('Seed');
    logger.error(`Failed to run admin seed: ${error.message}`, error.stack);
    // Don't exit on seed failure - application can still run
  }

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API documentation available at: http://localhost:${port}/api/docs`);
}

bootstrap();
