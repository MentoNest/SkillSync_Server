import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DatabaseHealthService } from './database/database-health.service';
import { buildSwaggerConfig, SWAGGER_EXTRA_MODELS } from './swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Expose interactive Swagger UI at /api/docs in every environment except production.
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig(), {
      extraModels: SWAGGER_EXTRA_MODELS,
    });
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'SkillSync API Docs',
    });
  }

  // Refuse to start serving if the database does not answer.
  await app.get(DatabaseHealthService).verify();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
