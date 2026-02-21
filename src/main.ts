import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    // 🔐 Disable x-powered-by
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    app.getHttpAdapter().getInstance().disable('x-powered-by');

    // 🛡 Helmet
    app.use(
      helmet({
        contentSecurityPolicy: configService.nodeEnv === 'production' ? undefined : false,
      }),
    );

    // 🌍 CORS via ConfigModule
    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) return callback(null, true);

        if (configService.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: configService.corsMethods,
      credentials: configService.corsCredentials,
    });

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


    // 🚦 Global Rate Limiting will be applied via guards on individual routes
    if (configService.rateLimitEnabled) {
      logger.log('✅ Global rate limiting available via guards');
    } else {
      logger.log('⚠️  Global rate limiting disabled');
    }

    await app.listen(configService.port);

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
