import * as dotenv from 'dotenv';

// Load .env before anything else
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from '@app/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  
  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription('SkillSync - Mentorship Marketplace API')
    .setVersion('1.0')
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
