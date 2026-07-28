import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module.js';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): { field: string; code: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const ownMessages = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({ field, code, message }),
    );

    const childMessages = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...ownMessages, ...childMessages];
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // -----------------------------------------------------------------------
  // #1017: CORS configuration
  // -----------------------------------------------------------------------
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    credentials: true,
  });

  // -----------------------------------------------------------------------
  // Global pipes
  // -----------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          errors: flattenValidationErrors(errors),
        }),
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
