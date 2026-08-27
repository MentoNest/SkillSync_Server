import { AppConfig } from './app-config';

describe('AppConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return development as default nodeEnv', () => {
    delete process.env.NODE_ENV;
    const config = AppConfig.getInstance();
    expect(config.nodeEnv).toBe('development');
    expect(config.isProduction).toBe(false);
  });

  it('should detect production mode', () => {
    process.env.NODE_ENV = 'production';
    const config = AppConfig.getInstance();
    expect(config.isProduction).toBe(true);
  });

  it('should parse CORS_ORIGINS from env', () => {
    process.env.CORS_ORIGINS = 'https://app.example.com, https://staging.example.com';
    const config = AppConfig.getInstance();
    expect(config.corsOrigins).toEqual(['https://app.example.com', 'https://staging.example.com']);
  });

  it('should default CORS origins to localhost', () => {
    delete process.env.CORS_ORIGINS;
    const config = AppConfig.getInstance();
    expect(config.corsOrigins).toContain('http://localhost:3000');
  });

  it('should throw on missing JWT_SECRET in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    const config = AppConfig.getInstance();
    expect(() => config.validate()).toThrow('Missing required environment variables');
  });

  it('should parse db config from env', () => {
    process.env.DB_HOST = 'db.example.com';
    process.env.DB_PORT = '5433';
    const config = AppConfig.getInstance();
    expect(config.dbConfig.host).toBe('db.example.com');
    expect(config.dbConfig.port).toBe(5433);
  });
});
