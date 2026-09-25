import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule, ObserveInstrument } from './app.module.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    // Source maps enabled for debugging — configured in tsconfig
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const env = configService.get<string>('app.env') ?? 'development';

  // ─── Global Pipes ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // Strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,       // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── CORS ──────────────────────────────────────────────────────────────
  if (env !== 'production') {
    app.enableCors();
  }

  // ─── Graceful Shutdown ─────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ─── API prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  await app.listen(port);
  logger.log(`🚀 SkillSync server running on http://localhost:${port}/api/v1`);
  logger.log(`📌 Environment: ${env}`);
}

await bootstrap();
