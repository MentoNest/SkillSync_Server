import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);

    app.useGlobalFilters(new HttpExceptionFilter());

    await app.listen(process.env.PORT || 3000);

    logger.log(
      `🚀 Server is running on http://localhost:${process.env.PORT || 3000}`,
    );
  } catch (error) {
    logger.error('❌ Application failed to start', error.stack);
    process.exit(1);
  }
}
bootstrap();
