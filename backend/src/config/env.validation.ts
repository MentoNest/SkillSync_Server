import Joi from 'joi';

/**
 * Joi schema for environment variable validation.
 * App fails at startup if required variables are missing or invalid.
 */
export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('SkillSync'),

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
});
