/**
 * CLI entry for `npm run seed:demo` (#1474).
 *
 * Idempotent: creates or updates demo mentor/mentee accounts only.
 * Requires a reachable database and seeded RBAC roles.
 */
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfigFactory } from '../config/database.config';
import { ConfigService } from '@nestjs/config';
import { DemoSeedModule } from './demo-seed.module';
import { DemoSeedService } from './demo-seed.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfigFactory,
    }),
    DemoSeedModule,
  ],
})
class DemoSeedCliModule {}

async function main() {
  const logger = new Logger('seed:demo');
  const flag = process.env.SEED_DEMO_DATA;
  if (flag === 'false' || flag === '0') {
    logger.warn('SEED_DEMO_DATA is false — aborting');
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(DemoSeedCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const seed = app.get(DemoSeedService);
    const result = await seed.seed();
    logger.log(`Seeded ${result.mentors} mentors and ${result.mentees} mentees`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
