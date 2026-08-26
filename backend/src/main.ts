import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GracefulShutdownService } from './common/shutdown/graceful-shutdown.service';
import { EncryptionService } from './common/encryption/encryption.service';
import { BackupService } from './common/backup/backup.service';
import * as crypto from 'crypto';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Request ID middleware
  app.use((req: any, _res: any, next: () => void) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    _res.setHeader('X-Request-Id', requestId);
    next();
  });

  // API Versioning - URI path strategy
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

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

  // Initialize graceful shutdown
  const shutdownService = app.get(GracefulShutdownService);
  shutdownService.initialize(app);

  // Initialize encryption service
  try {
    const encryptionService = app.get(EncryptionService);
    logger.log('Encryption service initialized');
  } catch (error) {
    logger.warn('Encryption service not available');
  }

  // Initialize backup service and start automated backups
  try {
    const backupService = app.get(BackupService);
    backupService.startAutomatedBackups();
    logger.log('Backup service initialized with automated backups');
  } catch (error) {
    logger.warn('Backup service not available');
  }

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
      .addTag('Admin', 'Admin dashboard and platform management')
      .addTag('Notifications', 'User notification system')
      .addTag('Health', 'System health and backup status')
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
  logger.log(`Application running on port ${port}`);
  logger.log(`API versioning enabled: /api/v1/...`);
  if (enableSwagger) {
    logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
