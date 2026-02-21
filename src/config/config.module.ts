import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { ConfigService } from './config.service';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

        PORT: Joi.number().default(3000),

        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_NAME: Joi.string().required(),
        DB_SSL: Joi.boolean().default(false),

        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        REDIS_DB: Joi.number().default(0),

        /**
         * 🌍 CORS Configuration
         */
        CORS_ORIGINS: Joi.string().required(),
        CORS_METHODS: Joi.string().default('GET,POST,PUT,PATCH,DELETE'),
        CORS_CREDENTIALS: Joi.boolean().default(true),

        /**
         * 🚦 Rate Limiting Configuration
         */
        RATE_LIMIT_ENABLED: Joi.boolean().default(true),
        RATE_LIMIT_GLOBAL_WINDOW_MS: Joi.number().default(60000),
        RATE_LIMIT_GLOBAL_MAX: Joi.number().default(100),
        RATE_LIMIT_PER_IP_WINDOW_MS: Joi.number().default(60000),
        RATE_LIMIT_PER_IP_MAX: Joi.number().default(100),
        RATE_LIMIT_PER_WALLET_WINDOW_MS: Joi.number().default(60000),
        RATE_LIMIT_PER_WALLET_MAX: Joi.number().default(50),
        RATE_LIMIT_PER_USER_WINDOW_MS: Joi.number().default(60000),
        RATE_LIMIT_PER_USER_MAX: Joi.number().default(200),
        RATE_LIMIT_STRICT_MAX: Joi.number().default(10),
        RATE_LIMIT_RELAXED_MAX: Joi.number().default(1000),
        RATE_LIMIT_EXEMPT_PATHS: Joi.string().default('/health,/health/redis'),

        /**
         * 🔐 JWT Configuration
         */
        JWT_SECRET: Joi.string().default('dev-secret-key-for-skill-sync-server'),
        JWT_EXPIRES_IN: Joi.string().default('1h'),
      }),
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
