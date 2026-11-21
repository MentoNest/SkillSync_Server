import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DatabaseHealthService } from './database/database-health.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Expose interactive Swagger UI at /api/docs in every environment except production.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription(
        'REST API for the SkillSync platform. ' +
          'Authentication is wallet-based (Stellar ED25519): request a nonce, sign it, exchange the signature for JWT tokens.',
      )
      .setVersion('1.0')
      .addTag('Authentication', 'Wallet login and token lifecycle endpoints.')
      .addTag('Wallet', 'Nonce issuance for Stellar wallet sign-in.')
      .addTag('Session Management', 'Token refresh and revocation.')
      .addTag('Users', 'Username, display name, and public profile endpoints.')
      .addTag('Profiles', 'Mentor and mentee profile creation and management.')
      .addTag('Admin', 'Admin-only endpoints. Require the ADMIN role.')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Paste the accessToken returned by POST /auth/login. ' +
            'Format: Bearer <token>',
          name: 'Authorization',
          in: 'header',
        },
        'Bearer Auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
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
