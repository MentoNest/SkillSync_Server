import Joi from 'joi';
import { parseTrustProxy } from './production-security.config.js';

/**
 * Joi schema for environment variable validation.
 * App fails at startup if required variables are missing or invalid.
 */
export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .required(),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('SkillSync'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.string()
    .allow('')
    .default('')
    .custom((value, helpers) => {
      try {
        parseTrustProxy(value);
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    }),

  // Production credentials are checked together below to support HS256 and RS256.
  JWT_ALGORITHM: Joi.string().valid('HS256', 'RS256').default('HS256'),
  JWT_SECRET: Joi.string().allow('').default(''),
  JWT_PRIVATE_KEY: Joi.string().allow('').default(''),
  ENCRYPTION_KEY: Joi.string().allow('').default(''),
  SEARCH_HASH_SALT: Joi.string().allow('').default(''),
  BACKUP_ENCRYPTION: Joi.boolean().default(false),
  BACKUP_ENCRYPTION_KEY: Joi.string().allow('').default(''),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  DB_POOL_SIZE: Joi.number().min(1).max(100).default(10),
  DB_SSL: Joi.boolean().default(false),

  // Feature Flags
  FEATURE_FLAG_NEW_MATCHING: Joi.boolean().default(false),
  FEATURE_FLAG_AI_RECOMMENDATIONS: Joi.boolean().default(false),

  // Bootstrap seed (#1319)
  DISABLE_SEED: Joi.boolean().default(false),
  DEFAULT_ADMIN_WALLET: Joi.string().allow('').optional(),
  TEST_ADMIN_WALLET: Joi.string().allow('').optional(),

  // Audit log retention (#1320) - days before an audit event is purged.
  AUDIT_LOG_RETENTION_DAYS: Joi.number().integer().min(1).max(3650).default(90),
}).custom((config, helpers) => {
  if (config.NODE_ENV !== 'production') return config;

  const missing: string[] = [];
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
    missing.push('JWT_SECRET (at least 32 characters)');
  }
  if (config.JWT_ALGORITHM === 'RS256' && !config.JWT_PRIVATE_KEY) {
    missing.push('JWT_PRIVATE_KEY for RS256');
  }
  if (!/^[\da-f]{64}$/i.test(config.ENCRYPTION_KEY ?? '')) {
    missing.push('ENCRYPTION_KEY (64 hexadecimal characters)');
  }
  if (!config.SEARCH_HASH_SALT || config.SEARCH_HASH_SALT.length < 32) {
    missing.push('SEARCH_HASH_SALT (at least 32 characters)');
  }
  if (!config.CORS_ORIGINS?.trim()) {
    missing.push('CORS_ORIGINS');
  } else if (
    config.CORS_ORIGINS.split(',').some((origin: string) =>
      /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin.trim()),
    )
  ) {
    missing.push('CORS_ORIGINS must not include localhost in production');
  }
  if (config.BACKUP_ENCRYPTION && !config.BACKUP_ENCRYPTION_KEY) {
    missing.push('BACKUP_ENCRYPTION_KEY when backup encryption is enabled');
  }

  return missing.length > 0
    ? helpers.error('any.custom', { details: missing.join(', ') })
    : config;
}, 'production secrets and origin validation').messages({
  'any.custom': 'Invalid production configuration: {{#details}}',
});
