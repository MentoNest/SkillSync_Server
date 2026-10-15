import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { parseTrustProxy } from './config/trust-proxy.util.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  try {
    const app = await NestFactory.create(AppModule);

    app.enableShutdownHooks();

    // Drop unknown fields from request bodies instead of passing them through.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    app.getHttpAdapter()
      .getInstance()
      .set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

    const configService = app.get(ConfigService);
    const port = configService.get<number>('app.port') ?? 3000;
    const env = configService.get<string>('app.env') ?? 'development';

    // Boot gate (#1421): initialize the app — which connects to PostgreSQL —
    // and verify the connection before the server accepts any traffic.
    await app.init();
    const dataSource = app.get(DataSource);
    if (!dataSource.isInitialized) {
      throw new Error('PostgreSQL connection is not initialized — refusing to start');
    }
    logger.log('PostgreSQL connection verified');

    await app.listen(port);
    logger.log(`SkillSync backend (${env}) listening on port ${port}`);
  } catch (error) {
    logger.error('Fatal startup error', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

void bootstrap();
