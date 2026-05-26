import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable NestJS built-in logger noise; our middleware handles request logs
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Attach unhandled errors to res.locals so the logger middleware can read stack traces
  app.use((_err: Error, _req: unknown, res: { locals: { error: Error } }, next: (e: Error) => void) => {
    res.locals.error = _err;
    next(_err);
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
