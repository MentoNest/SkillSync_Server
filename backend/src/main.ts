import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
  Logger,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module.js';

/**
 * #1006: Flattens class-validator's nested ValidationError tree into a
 * simple { field, code, message }[] shape.
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

/**
 * #1026: Request ID middleware — generates a UUID v4 for each request,
 * attaches it to the response header (X-Request-Id), and stores it
 * in async-local storage so downstream loggers can pick it up.
 */
const requestContext = new Map<string, string>();

export function getRequestId(): string | undefined {
  const cls = (globalThis as any).__requestId;
  return cls;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // -----------------------------------------------------------------------
  // #1025: API versioning — URI path strategy (/api/v1/...)
  // -----------------------------------------------------------------------
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // -----------------------------------------------------------------------
  // #1026: Request ID middleware
  // -----------------------------------------------------------------------
  app.use((req: any, res: any, next: () => void) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    (globalThis as any).__requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    req.requestId = requestId;

    // Add requestId to error responses
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (body && typeof body === 'object' && body.error) {
        body.requestId = requestId;
      }
      return originalJson(body);
    };

    next();
  });

  // -----------------------------------------------------------------------
  // CORS configuration placeholder (enhanced in #1017 by Maryermarh)
  // -----------------------------------------------------------------------
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Request-Id'],
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
          requestId: (globalThis as any).__requestId,
        }),
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`SkillSync backend listening on port ${port} (API v1)`);
}
void bootstrap();
