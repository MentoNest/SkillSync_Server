import { validateEnvironment } from '../app.config';

const PRODUCTION_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(40),
  DB_NAME: 'skillsync',
  DB_PASSWORD: 'super-secret',
  DEFAULT_ADMIN_WALLET: 'GADMIN',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
};

const reader = (over: Record<string, string | undefined> = {}) => {
  const env = { ...PRODUCTION_ENV, ...over };
  return (key: string) => env[key];
};

describe('validateEnvironment', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('accepts a complete production configuration', () => {
    const config = validateEnvironment(reader());
    expect(config.isProduction).toBe(true);
    expect(config.corsAllowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
    expect(config.cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'strict' });
    expect(config.rateLimit).toMatchObject({ authenticatedMax: 50, unauthenticatedMax: 10 });
    expect(config.swaggerEnabled).toBe(false);
    expect(config.graphqlPlaygroundEnabled).toBe(false);
    expect(config.trustProxy).toBe(1);
  });

  it.each([
    ['JWT_SECRET', { JWT_SECRET: 'short' }],
    ['DB_PASSWORD', { DB_PASSWORD: undefined }],
    ['DB_NAME', { DB_NAME: undefined }],
    ['DEFAULT_ADMIN_WALLET', { DEFAULT_ADMIN_WALLET: undefined }],
    ['CORS_ALLOWED_ORIGINS', { CORS_ALLOWED_ORIGINS: undefined }],
  ])('rejects production without a valid %s', (_label, over) => {
    expect(() => validateEnvironment(reader(over))).toThrow(/Invalid application configuration/);
  });

  it('allows a disabled seed instead of an admin wallet', () => {
    expect(() =>
      validateEnvironment(reader({ DEFAULT_ADMIN_WALLET: undefined, DISABLE_SEED: 'true' })),
    ).not.toThrow();
  });

  it('rejects wildcard and non-HTTPS origins in production', () => {
    expect(() => validateEnvironment(reader({ CORS_ALLOWED_ORIGINS: '*' }))).toThrow(/exact origins/);
    expect(() => validateEnvironment(reader({ CORS_ALLOWED_ORIGINS: 'http://app.example.com' }))).toThrow(
      /https in production/,
    );
  });

  it('rejects invalid numbers and rate limits where anonymous beats authenticated', () => {
    expect(() => validateEnvironment(reader({ FEATURED_MENTOR_LIMIT: '0' }))).toThrow(
      /FEATURED_MENTOR_LIMIT/,
    );
    expect(() =>
      validateEnvironment(
        reader({ RATE_LIMIT_AUTHENTICATED_MAX: '5', RATE_LIMIT_UNAUTHENTICATED_MAX: '10' }),
      ),
    ).toThrow(/RATE_LIMIT_AUTHENTICATED_MAX/);
  });

  it('keeps Swagger available outside production with development defaults', () => {
    const config = validateEnvironment(
      reader({ NODE_ENV: 'development', DB_PASSWORD: undefined, DB_NAME: undefined, CORS_ALLOWED_ORIGINS: undefined }),
    );
    expect(config.isProduction).toBe(false);
    expect(config.swaggerEnabled).toBe(true);
    expect(config.cookie.secure).toBe(false);
    expect(config.rateLimit.authenticatedMax).toBe(500);
  });

  it('rejects unknown NODE_ENV values', () => {
    expect(() => validateEnvironment(reader({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/);
  });
});
