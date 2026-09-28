export class AppConfig {
  private static instance: AppConfig;

  static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get corsOrigins(): string[] {
    return process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173'];
  }

  get jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (this.isProduction && (!secret || secret === 'your-secret-key-change-in-production')) {
      throw new Error('JWT_SECRET must be set in production');
    }
    return secret || 'your-secret-key-change-in-production';
  }

  get dbConfig() {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'skillsync',
    };
  }

  get redisConfig() {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    };
  }

  get enableSwagger(): boolean {
    return !this.isProduction || process.env.ENABLE_SWAGGER === 'true';
  }

  get trustedIps(): string[] {
    return process.env.TRUSTED_IPS
      ? process.env.TRUSTED_IPS.split(',').map((ip) => ip.trim())
      : [];
  }

  validate(): void {
    if (this.isProduction) {
      const required = ['JWT_SECRET', 'DB_PASSWORD', 'DB_HOST'];
      const missing = required.filter((key) => !process.env[key]);
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables for production: ${missing.join(', ')}`);
      }

      if (this.jwtSecret === 'your-secret-key-change-in-production') {
        throw new Error('JWT_SECRET must be changed from default in production');
      }
    }
  }
}
