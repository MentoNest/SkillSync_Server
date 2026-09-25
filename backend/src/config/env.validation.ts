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
});
