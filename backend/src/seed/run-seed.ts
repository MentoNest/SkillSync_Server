import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { seedDemoData } from './seed.service';

async function runSeed() {
  const shouldSeed = process.argv.includes('--seed') || process.env.SEED_DEMO_DATA === 'true';

  if (!shouldSeed) {
    console.log('Seed skipped. Set SEED_DEMO_DATA=true or pass --seed flag to run.');
    return;
  }

  console.log('Starting demo data seed...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    await seedDemoData(dataSource);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runSeed();
