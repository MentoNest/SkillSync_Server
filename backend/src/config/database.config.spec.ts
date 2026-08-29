import { getDatabaseConfig, getDatabaseRetryConfig } from './database.config';

describe('database.config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to localhost/5432/skillsync when no env vars are set', () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_DATABASE;
    const config: any = getDatabaseConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
    expect(config.database).toBe('skillsync');
  });

  it('reads connection details from environment variables', () => {
    process.env.DB_HOST = 'db.example.com';
    process.env.DB_PORT = '5433';
    process.env.DB_USERNAME = 'app_user';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_DATABASE = 'app_db';
    const config: any = getDatabaseConfig();
    expect(config.host).toBe('db.example.com');
    expect(config.port).toBe(5433);
    expect(config.username).toBe('app_user');
    expect(config.password).toBe('secret');
    expect(config.database).toBe('app_db');
  });

  it('enables synchronize outside production by default', () => {
    delete process.env.NODE_ENV;
    delete process.env.DB_SYNCHRONIZE;
    const config: any = getDatabaseConfig();
    expect(config.synchronize).toBe(true);
  });

  it('disables synchronize in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_SYNCHRONIZE;
    const config: any = getDatabaseConfig();
    expect(config.synchronize).toBe(false);
  });

  it('disables SSL by default', () => {
    delete process.env.DB_SSL;
    const config: any = getDatabaseConfig();
    expect(config.ssl).toBe(false);
  });

  it('enables SSL with rejectUnauthorized when DB_SSL=true', () => {
    process.env.DB_SSL = 'true';
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const config: any = getDatabaseConfig();
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('allows disabling certificate validation explicitly', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
    const config: any = getDatabaseConfig();
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('defaults the connection pool to 10-20 connections', () => {
    delete process.env.DB_POOL_MAX;
    delete process.env.DB_POOL_MIN;
    const config: any = getDatabaseConfig();
    expect(config.extra.min).toBe(10);
    expect(config.extra.max).toBe(20);
  });

  it('respects custom pool sizes from env vars', () => {
    process.env.DB_POOL_MIN = '5';
    process.env.DB_POOL_MAX = '15';
    const config: any = getDatabaseConfig();
    expect(config.extra.min).toBe(5);
    expect(config.extra.max).toBe(15);
  });

  it('enables verbose logging with slow-query threshold outside production', () => {
    delete process.env.NODE_ENV;
    delete process.env.DB_SLOW_QUERY_MS;
    const config: any = getDatabaseConfig();
    expect(config.logging).toContain('query');
    expect(config.maxQueryExecutionTime).toBe(1000);
  });

  it('only logs errors in production', () => {
    process.env.NODE_ENV = 'production';
    const config: any = getDatabaseConfig();
    expect(config.logging).toEqual(['error']);
  });

  it('defaults retry config to 5 attempts', () => {
    delete process.env.DB_MAX_RETRIES;
    delete process.env.DB_RETRY_DELAY_MS;
    const retry = getDatabaseRetryConfig();
    expect(retry.retryAttempts).toBe(5);
    expect(retry.retryDelay).toBe(3000);
  });

  it('respects DB_MAX_RETRIES override', () => {
    process.env.DB_MAX_RETRIES = '3';
    const retry = getDatabaseRetryConfig();
    expect(retry.retryAttempts).toBe(3);
  });
});
