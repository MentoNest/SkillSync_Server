import {
  buildDatabaseSettings,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_SLOW_QUERY_MS,
  EnvReader,
} from './database.config';

const reader =
  (env: Record<string, string>): EnvReader =>
  (key) =>
    env[key];

const production = {
  NODE_ENV: 'production',
  DB_HOST: 'db.internal',
  DB_PORT: '6543',
  DB_USERNAME: 'app',
  DB_PASSWORD: 'secret',
  DB_NAME: 'skillsync_prod',
};

describe('buildDatabaseSettings', () => {
  it('reads host, port, user, password and database from the environment', () => {
    const { options } = buildDatabaseSettings(reader(production));

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db.internal',
      port: 6543,
      username: 'app',
      password: 'secret',
      database: 'skillsync_prod',
      synchronize: false,
    });
  });

  it('has local defaults in development', () => {
    const { options } = buildDatabaseSettings(reader({}));

    expect(options).toMatchObject({ host: 'localhost', port: 5432, database: 'skillsync' });
  });

  it('requires the password and database name outside development', () => {
    expect(() => buildDatabaseSettings(reader({ NODE_ENV: 'production' }))).toThrow(
      'DB_PASSWORD, DB_NAME',
    );
    expect(() =>
      buildDatabaseSettings(reader({ ...production, DB_PASSWORD: '' })),
    ).toThrow('DB_PASSWORD');
  });

  it('rejects an invalid port or retry setting with a clear message', () => {
    expect(() => buildDatabaseSettings(reader({ DB_PORT: 'abc' }))).toThrow('DB_PORT');
    expect(() => buildDatabaseSettings(reader({ DB_RETRY_ATTEMPTS: '-1' }))).toThrow('DB_RETRY_ATTEMPTS');
  });

  describe('SSL', () => {
    it('is off by default and configurable per environment', () => {
      expect(buildDatabaseSettings(reader(production)).options).toMatchObject({ ssl: false });

      const on = buildDatabaseSettings(reader({ ...production, DB_SSL: 'true' })).options;
      expect(on).toMatchObject({ ssl: { rejectUnauthorized: true } });

      const relaxed = buildDatabaseSettings(
        reader({ ...production, DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' }),
      ).options;
      expect(relaxed).toMatchObject({ ssl: { rejectUnauthorized: false } });
    });

    it('accepts a CA certificate with escaped newlines', () => {
      const { options } = buildDatabaseSettings(
        reader({ ...production, DB_SSL: 'true', DB_SSL_CA: 'line1\\nline2' }),
      );
      expect(options).toMatchObject({ ssl: { ca: 'line1\nline2' } });
    });
  });

  describe('connection pool', () => {
    it('defaults to 20 connections and stays within 10-20', () => {
      expect(buildDatabaseSettings(reader(production)).options).toMatchObject({ poolSize: 20 });
      expect(buildDatabaseSettings(reader({ ...production, DB_POOL_SIZE: '5' })).options).toMatchObject({ poolSize: 10 });
      expect(buildDatabaseSettings(reader({ ...production, DB_POOL_SIZE: '50' })).options).toMatchObject({ poolSize: 20 });
      expect(buildDatabaseSettings(reader({ ...production, DB_POOL_SIZE: '15' })).options).toMatchObject({ poolSize: 15 });
    });

    it('sets connection and idle timeouts', () => {
      const { options } = buildDatabaseSettings(reader(production));
      expect(options.extra).toEqual({ connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
    });
  });

  describe('retry', () => {
    it('retries 5 times by default and can be configured', () => {
      const defaults = buildDatabaseSettings(reader(production));
      expect(defaults.retryAttempts).toBe(DEFAULT_RETRY_ATTEMPTS);
      expect(defaults.retryAttempts).toBe(5);

      const custom = buildDatabaseSettings(
        reader({ ...production, DB_RETRY_ATTEMPTS: '2', DB_RETRY_DELAY_MS: '500' }),
      );
      expect(custom).toMatchObject({ retryAttempts: 2, retryDelay: 500 });
    });
  });

  describe('entities and migrations', () => {
    it('loads entities from *.entity files and migrations from the migrations folder', () => {
      const { options } = buildDatabaseSettings(reader(production));

      expect(String((options.entities as string[])[0])).toMatch(/\*\*[\\/]\*\.entity\{\.ts,\.js\}$/);
      expect(String((options.migrations as string[])[0])).toMatch(/migrations[\\/]\*\{\.ts,\.js\}$/);
      expect(options).toMatchObject({ migrationsTableName: 'migrations', migrationsRun: false });
    });

    it('can run migrations at startup when asked to', () => {
      const { options } = buildDatabaseSettings(reader({ ...production, DB_MIGRATIONS_RUN: 'true' }));
      expect(options).toMatchObject({ migrationsRun: true });
    });
  });

  describe('slow query logging', () => {
    it('is enabled in development only', () => {
      const dev = buildDatabaseSettings(reader({})).options;
      expect(dev.maxQueryExecutionTime).toBe(DEFAULT_SLOW_QUERY_MS);
      expect(dev.logging).toEqual(['error', 'warn', 'migration']);

      const prod = buildDatabaseSettings(reader(production)).options;
      expect(prod.maxQueryExecutionTime).toBeUndefined();
      expect(prod.logging).toEqual(['error']);
    });

    it('uses the configured threshold', () => {
      const { options } = buildDatabaseSettings(reader({ DB_SLOW_QUERY_MS: '50' }));
      expect(options.maxQueryExecutionTime).toBe(50);
    });
  });
});
