import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DemoSeedService } from './demo-seed.service.js';

const app = await NestFactory.createApplicationContext(AppModule);
try {
  await app.get(DemoSeedService).seed(true);
} finally {
  await app.close();
}
