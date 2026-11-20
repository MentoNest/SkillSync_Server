import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseHealthService } from './database/database-health.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Refuse to start serving if the database does not answer.
  await app.get(DatabaseHealthService).verify();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
