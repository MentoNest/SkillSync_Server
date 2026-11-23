import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseSettings } from '../database/database.config';
import { DemoSeedModule } from './demo-seed.module';
import { isDemoSeedEnabled } from './demo-seed.flag';
import { DemoSeedResult, DemoSeedService } from './demo-seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { options, retryAttempts, retryDelay } = buildDatabaseSettings(
          (key) => config.get<string>(key),
        );
        return {
          ...options,
          autoLoadEntities: true,
          retryAttempts,
          retryDelay,
        };
      },
    }),
    DemoSeedModule,
  ],
})
class DemoSeedCliModule {}

export async function runDemoSeed(): Promise<DemoSeedResult | null> {
  const logger = new Logger('seed:demo');
  if (!isDemoSeedEnabled(process.env.SEED_DEMO_DATA)) {
    logger.warn('SEED_DEMO_DATA is false — skipping demo seed');
    return null;
  }

  const app = await NestFactory.createApplicationContext(DemoSeedCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(DemoSeedService).seed();
    logger.log(
      `Seeded ${result.mentorsCreated} mentors and ${result.menteesCreated} mentees`,
    );
    return result;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runDemoSeed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
