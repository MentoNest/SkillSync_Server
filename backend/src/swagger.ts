import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Mounts the OpenAPI UI at /api/docs and the JSON spec at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
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
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
