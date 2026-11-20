import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/filters/validation';
import { createRequestLogger } from './common/logging/request-logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(createRequestLogger());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
