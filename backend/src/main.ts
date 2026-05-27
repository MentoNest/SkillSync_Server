import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Verify database connection before starting server
  const dataSource = app.get(DataSource);
  if (!dataSource.isInitialized) {
    throw new Error('Database connection failed to initialize');
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
