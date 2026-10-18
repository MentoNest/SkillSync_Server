import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Builds the OpenAPI document (also used by the contract-testing scripts). */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription(
      'Wallet-based authentication: request a nonce, sign it with your Stellar key, ' +
        'exchange the signature for a JWT access token and refresh token.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('Auth', 'Nonce, login, refresh, logout and session management')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Mounts the OpenAPI UI at /api/docs and the JSON spec at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
