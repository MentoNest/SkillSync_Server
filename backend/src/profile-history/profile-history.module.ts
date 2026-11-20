import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProfileHistoryContextMiddleware } from './profile-history-context.middleware';
import { ProfileHistoryController } from './profile-history.controller';
import { ProfileHistory } from './profile-history.entity';
import { ProfileHistoryService } from './profile-history.service';
import { UserEntitySubscriber } from './user-entity.subscriber';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfileHistory]),
    // JwtModule is needed by the context middleware to decode (not verify) Bearer tokens.
    JwtModule.register({}),
    AuthModule,
  ],
  controllers: [ProfileHistoryController],
  providers: [ProfileHistoryService, UserEntitySubscriber],
  exports: [ProfileHistoryService],
})
export class ProfileHistoryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply to all routes so any authenticated mutation request carries context.
    consumer.apply(ProfileHistoryContextMiddleware).forRoutes('*');
  }
}
