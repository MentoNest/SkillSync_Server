import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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


  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription('SkillSync authentication and user management API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'Bearer Auth',
      )
      .addTag('Authentication')
      .addTag('Wallet')
      .addTag('Session Management')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
