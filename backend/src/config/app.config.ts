import { randomBytes } from 'crypto';

/**
 * Central, fail-fast configuration for the SkillSync API.
 *
 * Every deployment-specific value is read from the environment. In production
 * the secrets and the browser origin whitelist are mandatory, so a misconfigured
 * container stops at boot instead of serving an insecure API.
 */
export type EnvReader = (key: string) => string | undefined;

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;
  authenticatedMax: number;
  unauthenticatedMax: number;
}

export interface CookieSecurityConfig {
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  isProduction: boolean;
  requireEmailVerification: boolean;
  /** Exact origins allowed by CORS. Never a wildcard in production. */
  corsAllowedOrigins: string[];
  /** Express `trust proxy` value when running behind Nginx/Cloudflare/a load balancer. */
  trustProxy: boolean | number | string;
  rateLimit: RateLimitConfig;
  cookie: CookieSecurityConfig;
  /** Swagger UI is only mounted outside production. */
  swaggerEnabled: boolean;
  /** No GraphQL playground is mounted in production. */
  graphqlPlaygroundEnabled: boolean;
  featuredMentors: {
    max: number;
    durationDays: number;
  };
  profileCompleteness: {
    cacheTtlSeconds: number;
    minimumSuggestionScore: number;
  };
}

export const APP_CONFIG = 'APP_CONFIG';

const NODE_ENVIRONMENTS: NodeEnvironment[] = [
  'development',
  'test',
  'production',
];

function readInteger(
  read: EnvReader,
  key: string,
  fallback: number,
  min = 1,
): number {
  const raw = read(key);
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${key} must be an integer >= ${min}, got "${raw}"`);
  }
  return parsed;
}

function readBoolean(read: EnvReader, key: string, fallback: boolean): boolean {
  const raw = read(key)?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${key} must be "true" or "false", got "${raw}"`);
}

function readList(read: EnvReader, key: string): string[] {
  return (read(key) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function readTrustProxy(
  read: EnvReader,
  isProduction: boolean,
): boolean | number | string {
  const raw = read('TRUST_PROXY')?.trim();
  if (!raw) return isProduction ? 1 : false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  return raw; // IP address or CIDR list, forwarded to Express verbatim.
}

/**
 * Validates every environment variable used by the HTTP layer.
 * Throws with all problems collected in one message to make deploy failures obvious.
 */
export function validateEnvironment(
  read: EnvReader = (key) => process.env[key],
): AppConfig {
  const rawEnv = read('NODE_ENV')?.trim().toLowerCase() || 'development';
  if (!NODE_ENVIRONMENTS.includes(rawEnv as NodeEnvironment)) {
    throw new Error(
      `NODE_ENV must be one of ${NODE_ENVIRONMENTS.join(', ')}, got "${rawEnv}"`,
    );
  }
  const nodeEnv = rawEnv as NodeEnvironment;
  const isProduction = nodeEnv === 'production';
  const problems: string[] = [];

  let jwtSecret = read('JWT_SECRET');
  if (!jwtSecret && nodeEnv === 'test') {
    // Tests get an ephemeral secret; no signing key is ever committed to source.
    jwtSecret = randomBytes(32).toString('hex');
    process.env.JWT_SECRET = jwtSecret;
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be set to at least 32 characters');
  }
  const dbName = read('DB_NAME');
  const dbPassword = read('DB_PASSWORD');
  if (isProduction && !dbName)
    problems.push('DB_NAME must be set in production');
  if (isProduction && !dbPassword)
    problems.push('DB_PASSWORD must be set in production');

  const seedDisabled = readBoolean(read, 'DISABLE_SEED', false);
  if (isProduction && !seedDisabled && !read('DEFAULT_ADMIN_WALLET')) {
    problems.push(
      'DEFAULT_ADMIN_WALLET must be set in production (or set DISABLE_SEED=true)',
    );
  }

  const corsAllowedOrigins = readList(read, 'CORS_ALLOWED_ORIGINS');
  if (corsAllowedOrigins.some((origin) => origin === '*')) {
    problems.push(
      'CORS_ALLOWED_ORIGINS must list exact origins, "*" is not allowed',
    );
  }
  if (isProduction && corsAllowedOrigins.length === 0) {
    problems.push(
      'CORS_ALLOWED_ORIGINS must list at least one trusted frontend origin in production',
    );
  }
  for (const origin of corsAllowedOrigins) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        problems.push(
          `CORS_ALLOWED_ORIGINS entry "${origin}" must use http or https`,
        );
      }
      if (isProduction && parsed.protocol !== 'https:') {
        problems.push(
          `CORS_ALLOWED_ORIGINS entry "${origin}" must use https in production`,
        );
      }
    } catch {
      problems.push(
        `CORS_ALLOWED_ORIGINS entry "${origin}" is not a valid URL`,
      );
    }
  }

  const authenticatedMax = readInteger(
    read,
    'RATE_LIMIT_AUTHENTICATED_MAX',
    isProduction ? 50 : 500,
  );
  const unauthenticatedMax = readInteger(
    read,
    'RATE_LIMIT_UNAUTHENTICATED_MAX',
    isProduction ? 10 : 200,
  );
  if (authenticatedMax < unauthenticatedMax) {
    problems.push(
      'RATE_LIMIT_AUTHENTICATED_MAX must be >= RATE_LIMIT_UNAUTHENTICATED_MAX',
    );
  }

  const featuredMax = readInteger(read, 'FEATURED_MENTOR_LIMIT', 10);
  const featuredDurationDays = readInteger(
    read,
    'FEATURED_MENTOR_DURATION_DAYS',
    30,
  );
  const cacheTtlSeconds = readInteger(
    read,
    'PROFILE_COMPLETENESS_CACHE_TTL_SECONDS',
    300,
  );

  if (problems.length > 0) {
    throw new Error(
      `Invalid application configuration:\n- ${problems.join('\n- ')}`,
    );
  }

  // Explicitly pin NODE_ENV so downstream libraries pick up production optimisations.
  process.env.NODE_ENV = nodeEnv;

  return {
    nodeEnv,
    port: readInteger(read, 'PORT', 3000),
    isProduction,
    requireEmailVerification: readBoolean(
      read,
      'REQUIRE_EMAIL_VERIFICATION',
      false,
    ),
    corsAllowedOrigins,
    trustProxy: readTrustProxy(read, isProduction),
    rateLimit: {
      enabled: readBoolean(read, 'RATE_LIMIT_ENABLED', true),
      windowMs: readInteger(read, 'RATE_LIMIT_WINDOW_MS', 60_000),
      authenticatedMax,
      unauthenticatedMax,
    },
    cookie: {
      // Secure cookies are mandatory in production and cannot be weakened by env.
      secure: isProduction || readBoolean(read, 'COOKIE_SECURE', false),
      httpOnly: true,
      sameSite: isProduction ? 'strict' : readSameSite(read),
    },
    swaggerEnabled: isProduction
      ? false
      : readBoolean(read, 'SWAGGER_ENABLED', true),
    graphqlPlaygroundEnabled: isProduction
      ? false
      : readBoolean(read, 'GRAPHQL_PLAYGROUND_ENABLED', false),
    featuredMentors: { max: featuredMax, durationDays: featuredDurationDays },
    profileCompleteness: {
      cacheTtlSeconds,
      minimumSuggestionScore: readInteger(
        read,
        'PROFILE_COMPLETENESS_SUGGESTION_THRESHOLD',
        80,
      ),
    },
  };
}

function readSameSite(read: EnvReader): 'strict' | 'lax' | 'none' {
  const raw = read('COOKIE_SAME_SITE')?.trim().toLowerCase() ?? 'strict';
  if (raw !== 'strict' && raw !== 'lax' && raw !== 'none') {
    throw new Error('COOKIE_SAME_SITE must be "strict", "lax" or "none"');
  }
  return raw;
}
