import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable NestJS built-in logger noise; our middleware handles request logs
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Verify database connection before starting server
  const dataSource = app.get(DataSource);
  if (!dataSource.isInitialized) {
    throw new Error('Database connection failed to initialize');
  }

  // Attach unhandled errors to res.locals so the logger middleware can read stack traces
  app.use((_err: Error, _req: unknown, res: { locals: { error: Error } }, next: (e: Error) => void) => {
    res.locals.error = _err;
    next(_err);
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
