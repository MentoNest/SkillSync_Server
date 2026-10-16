import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from '../../users/users.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/**
 * Import this module from the auth module that provides a SESSION_STORE
 * implementation (see session-store.port.ts).
 */
@Module({
  imports: [UsersModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    {
      provide: 'ACCESS_TOKEN_TTL_SECONDS',
      inject: [ConfigService],
      useFactory: (c: ConfigService) => parseInt(c.get<string>('JWT_ACCESS_TTL_SECONDS') ?? '900', 10),
    },
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
