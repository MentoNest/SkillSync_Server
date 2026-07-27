import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module.js';

/**
 * #1006: Flattens class-validator's nested ValidationError tree into a
 * simple { field, code, message }[] shape. `code` is the class-validator
 * constraint name (e.g. "isEmail"), kept stable/machine-readable so clients
 * can map it to a localized string; `message` is the English fallback.
 */
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
