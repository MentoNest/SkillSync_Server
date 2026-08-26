import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ApiVersioningService } from './api-versioning.service';
import { ApiVersioningMiddleware } from './api-versioning.middleware';

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
