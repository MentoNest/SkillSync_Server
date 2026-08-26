import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Swagger OpenAPI Documentation
  const isProduction = process.env.NODE_ENV === 'production';
  const enableSwagger = !isProduction || process.env.ENABLE_SWAGGER === 'true';

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription(
        'SkillSync Backend API Documentation. Complete endpoints for Authentication, Wallet Verification, Session Revocation, User Profiles, and Security Monitoring.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT Bearer token',
          in: 'header',
        },
        'Bearer Auth',
      )
      .addTag('Authentication', 'Core user authentication, token issuance, and refresh flows')
      .addTag('Wallet', 'Web3 Ethereum wallet cryptographic nonce challenge and signature verification')
      .addTag('Session Management', 'Device session revocation and logout operations')
      .addTag('User', 'User accounts, profile management (mentor/mentee), and settings')
      .addTag('Security & Audit', 'Suspicious activity detection and security dashboard')
      .addTag('Roles', 'Role-based access control and administrative permissions')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
      customSiteTitle: 'SkillSync API Docs',
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
  if (enableSwagger) {
    console.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
