import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, validateEnvironment } from './app.config';

/**
 * Loads `.env` into `process.env` and validates it before any feature module
 * is instantiated. Invalid production configuration aborts application boot.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env: Record<string, unknown>) => {
        validateEnvironment((key) => {
          const value = env[key];
          return value === undefined || value === null
            ? undefined
            : String(value);
        });
        return env;
      },
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => validateEnvironment(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
