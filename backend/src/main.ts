import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
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

  // Swagger UI â€” available in development and staging only
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription('SkillSync Server REST API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'Bearer Auth',
      )
      .addTag('Authentication', 'Wallet-based authentication endpoints')
      .addTag('Wallet', 'Wallet nonce generation')
      .addTag('Session Management', 'Token refresh and session control')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.use((_err: Error, _req: unknown, res: { locals: { error: Error } }, next: (e: Error) => void) => {
    res.locals.error = _err;
    next(_err);
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();