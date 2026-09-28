import { envValidationSchema } from './env.validation.js';

describe('environment validation', () => {
  const productionEnvironment = {
    NODE_ENV: 'production',
    DB_HOST: 'db.internal',
    DB_PORT: 5432,
    DB_USERNAME: 'skillsync',
    DB_PASSWORD: 'database-password',
    DB_DATABASE: 'skillsync',
    JWT_SECRET: 'production-jwt-secret-that-is-over-32-chars',
    ENCRYPTION_KEY: 'a'.repeat(64),
    SEARCH_HASH_SALT: 'production-search-hash-salt-over-32-chars',
    CORS_ORIGINS: 'https://skillsync.example.com',
  };

  it('accepts production configuration with environment-provided secrets', () => {
    const { error } = envValidationSchema.validate(productionEnvironment);
    expect(error).toBeUndefined();
  });

  it('requires NODE_ENV instead of silently selecting development mode', () => {
    expect(
      envValidationSchema.validate({
        ...productionEnvironment,
        NODE_ENV: undefined,
      }).error,
    ).toBeDefined();
  });

  it('rejects missing or weak production secrets', () => {
    const { error } = envValidationSchema.validate({
      ...productionEnvironment,
      JWT_SECRET: 'short',
      ENCRYPTION_KEY: '',
      SEARCH_HASH_SALT: '',
    });

    expect(error?.message).toContain('JWT_SECRET');
    expect(error?.message).toContain('ENCRYPTION_KEY');
    expect(error?.message).toContain('SEARCH_HASH_SALT');
  });

  it('requires a private key when production uses RS256', () => {
    const { error } = envValidationSchema.validate({
      ...productionEnvironment,
      JWT_ALGORITHM: 'RS256',
    });
    expect(error?.message).toContain('JWT_PRIVATE_KEY');
  });

  it('rejects trust-all proxy configuration', () => {
    const { error } = envValidationSchema.validate({
      ...productionEnvironment,
      TRUST_PROXY: 'true',
    });
    expect(error).toBeDefined();
  });
});