import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

import { LoggingMiddleware } from './middleware/logging.middleware';
import { RequestIdMiddleware } from './exceptions/request-id.middleware';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { setupSwagger } from './swagger/swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const loggingMiddleware = new LoggingMiddleware();
  const requestIdMiddleware = new RequestIdMiddleware();

  app.use(loggingMiddleware.use.bind(loggingMiddleware));
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => errors,
    }),
  );

  // OpenAPI / Swagger UI (disabled in production via env flag)
  if (process.env.SWAGGER_ENABLED !== 'false') {
    setupSwagger(app);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
