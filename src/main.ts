import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import { ConfigService } from './config/config.service';
import { RateLimitService } from './common/cache/rate-limit.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    // 🔐 Disable x-powered-by
    app.getHttpAdapter().getInstance().disable('x-powered-by');

    // 🛡 Helmet
    app.use(
      helmet({
        contentSecurityPolicy:
          configService.nodeEnv === 'production'
            ? undefined
            : false,
      }),
    );

    // 🌍 CORS via ConfigModule
    app.enableCors({
      origin: (origin, callback) => {
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

    app.useGlobalFilters(new HttpExceptionFilter());

    // 📝 Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    // 🚦 Global Rate Limiting will be applied via guards on individual routes
    if (configService.rateLimitEnabled) {
      logger.log('✅ Global rate limiting available via guards');
    } else {
      logger.log('⚠️  Global rate limiting disabled');
    }

    await app.listen(configService.port);

    logger.log(
      `🚀 Server is running on http://localhost:${configService.port}`,
    );
  } catch (error) {
    logger.error('❌ Application failed to start', error.stack);
    process.exit(1);
  }
}

bootstrap();
