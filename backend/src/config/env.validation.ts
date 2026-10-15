import Joi from 'joi';
import { parseTrustProxy } from './trust-proxy.util.js';

/**
 * Joi schema for environment variable validation (#1420).
 *
 * The application refuses to boot when a required variable is missing or a
 * value is invalid — misconfiguration is caught at startup rather than on the
 * first request that happens to need the value.
 *
 * Production runs an extra cross-field pass: secrets must be present and long
 * enough, and CORS must not point at localhost.
 */
export const envValidationSchema = Joi.object({
  // ── Application ────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .required(),
  PORT: Joi.number().port().default(3000),
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

  // ── Auth (consumed by the auth module) ─────────────────────
  JWT_ALGORITHM: Joi.string().valid('HS256', 'RS256').default('HS256'),
  JWT_SECRET: Joi.string().allow('').default(''),
  JWT_PRIVATE_KEY: Joi.string().allow('').default(''),
  ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL: Joi.string().default('7d'),

  // ── PostgreSQL ─────────────────────────────────────────────
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  DB_POOL_MIN: Joi.number().integer().min(1).max(100).default(10),
  DB_POOL_MAX: Joi.number().integer().min(1).max(100).default(20),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  DB_SYNCHRONIZE: Joi.boolean().optional(),
  DB_MAX_RETRIES: Joi.number().integer().min(1).max(20).default(5),
  DB_RETRY_DELAY_MS: Joi.number().integer().min(0).default(3000),
  DB_SLOW_QUERY_MS: Joi.number().integer().min(0).default(1000),

  // ── Redis ──────────────────────────────────────────────────
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('skillsync:'),
  REDIS_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),

  // ── Feature flags ──────────────────────────────────────────
  FEATURE_FLAG_NEW_MATCHING: Joi.boolean().default(false),
  FEATURE_FLAG_AI_RECOMMENDATIONS: Joi.boolean().default(false),
}).custom((config, helpers) => {
  if (config.NODE_ENV !== 'production') return config;

  const problems: string[] = [];
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET (at least 32 characters)');
  }
  if (config.JWT_ALGORITHM === 'RS256' && !config.JWT_PRIVATE_KEY) {
    problems.push('JWT_PRIVATE_KEY when JWT_ALGORITHM=RS256');
  }
  if (!config.CORS_ORIGINS?.trim()) {
    problems.push('CORS_ORIGINS');
  } else if (
    config.CORS_ORIGINS.split(',').some((origin: string) =>
      /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin.trim()),
    )
  ) {
    problems.push('CORS_ORIGINS must not include localhost in production');
  }
  if (config.DB_POOL_MIN > config.DB_POOL_MAX) {
    problems.push('DB_POOL_MIN must be <= DB_POOL_MAX');
  }

  return problems.length > 0
    ? helpers.error('any.custom', { details: problems.join(', ') })
    : config;
}, 'production configuration').messages({
  'any.custom': 'Invalid production configuration: {{#details}}',
});
