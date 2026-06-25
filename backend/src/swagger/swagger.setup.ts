import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api-docs';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription(
      'SkillSync backend API – Stellar wallet-based authentication and platform services',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health and readiness checks')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
