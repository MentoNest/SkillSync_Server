import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(requestLoggingMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
