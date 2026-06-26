import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';

async function main() {
  process.env.SEED_DEMO_DATA = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error'],
  });
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
