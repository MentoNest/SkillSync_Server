import * as dotenv from 'dotenv';

// Load .env before anything else
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from '@app/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalValidationPipe } from '@app/common/pipes/global-validation.pipe';
import { GlobalExceptionFilter } from '@app/common/filters/global-exception.filter';
import { LoggingInterceptor } from '@app/common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

 app.useGlobalPipes(new GlobalValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
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
