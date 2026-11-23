import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import helmet from 'helmet';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { BackupModule } from './backup/backup.module';
import { DatabaseModule } from './database/database.module';
import { ProfileHistoryModule } from './profile-history/profile-history.module';
import { ProfileCompletenessModule } from './profile/profile-completeness.module';
import { ProfileModule } from './profile/profile.module';
import { ShutdownModule } from './shutdown/shutdown.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    ShutdownModule,
    AuthModule,
    UserModule,
    ProfileHistoryModule,
    ProfileModule,
    ProfileCompletenessModule,
    AvailabilityModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const frontendDomain = process.env.FRONTEND_DOMAIN ?? 'http://localhost:3000';

    consumer
      .apply(
        helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              connectSrc: ["'self'", frontendDomain],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          },
          frameguard: { action: 'deny' },
          noSniff: true,
          xssFilter: true,
          hidePoweredBy: true,
          hsts: isProduction
            ? { maxAge: 31536000, includeSubDomains: true, preload: true }
            : false,
          referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        }),
        (req: any, res: any, next: any) => {
          res.setHeader('X-XSS-Protection', '1; mode=block');
          next();
        },
      )
      .forRoutes('*');
  }
}
