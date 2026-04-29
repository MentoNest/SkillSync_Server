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
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),

        PORT: Joi.number().default(3000),

        // Database - Required
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_NAME: Joi.string().required(),
        DB_SSL: Joi.boolean().default(false),

        // Redis - Required
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().required(),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        REDIS_DB: Joi.number().default(0),

        /**
         * 🔒 Trust Proxy Configuration
         */
        TRUST_PROXY: Joi.boolean().default(false),

        /**
         * 🍪 Cookie Security Configuration
         */
        COOKIE_SECURE: Joi.boolean().default(false),
        COOKIE_HTTP_ONLY: Joi.boolean().default(true),
        COOKIE_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default('strict'),
        COOKIE_DOMAIN: Joi.string().optional(),
        COOKIE_MAX_AGE: Joi.number().default(3600000),

        /**
         * 🌍 CORS Configuration
         */
        CORS_ORIGINS: Joi.string().required(),
        CORS_METHODS: Joi.string().default('GET,POST,PUT,PATCH,DELETE'),
        CORS_CREDENTIALS: Joi.boolean().default(true),

        /**
         * 🔐 JWT Configuration - Required in production
         */
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('1h'),

        /**
         * 📧 Mail Configuration
         */
        MAIL_SENDER: Joi.string().optional(),
        MAIL_SUBJECT_PREFIX: Joi.string().optional(),
        MAIL_APP_NAME: Joi.string().optional(),
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().optional(),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASSWORD: Joi.string().optional(),
        SMTP_SECURE: Joi.boolean().default(false),
        OTP_TTL_MINUTES: Joi.number().default(10),
        OTP_SUBJECT: Joi.string().optional(),

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
      }),
      validationOptions: {
        abortEarly: false, // Report all errors at once
      },
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
