import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ApiVersioningService } from './api-versioning.service.js';
import { ApiVersioningMiddleware } from './api-versioning.middleware.js';

@Global()
@Module({
  providers: [ApiVersioningService],
  exports: [ApiVersioningService],
})
export class ApiVersioningModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiVersioningMiddleware).forRoutes('*');
  }
}
