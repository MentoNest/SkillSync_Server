import * as dotenv from 'dotenv';

// Load .env before anything else
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config'; // Import ConfigService
import { AppModule } from './app.module';
import { DEFAULT_PORT } from '@app/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalValidationPipe } from '@app/common/pipes/global-validation.pipe';
import { GlobalExceptionFilter } from '@app/common/filters/global-exception.filter';
import { LoggingInterceptor } from '@app/common/interceptors/logging.interceptor';
import helmet from 'helmet'; // Import Helmet
import * as cors from 'cors'; // Import CORS
import * as rateLimit from 'express-rate-limit'; // Import rateLimit

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService); // Get ConfigService instance
  // Enable Helmet for security headers
  app.use(helmet());

  // Configure CORS dynamically
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '*');
  app.use(cors({
    origin: corsOrigins.split(',').map(origin => origin.trim()), // Split origins and trim whitespace
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  }));

  // Configure rate limiting
  const limiter = rateLimit({
    windowMs: configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
    max: configService.get<number>('RATE_LIMIT_MAX', 100), // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after some time',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });
  app.use(limiter);
  
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.useGlobalPipes(new GlobalValidationPipe());

  app.useGlobalFilters(new GlobalExceptionFilter());
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription('SkillSync - Mentorship Marketplace API')
    .setVersion('1.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('skills', 'Skill taxonomy management')
    .addTag('mentor-skills', 'Mentor skill attachments')
    .addTag('mentors', 'Mentor discovery and filtering')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || DEFAULT_PORT);
}
void bootstrap();
