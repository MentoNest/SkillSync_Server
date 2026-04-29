import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z, ZodObject } from 'zod';

@Injectable()
export class AppConfigService {
  private readonly envSchema: ZodObject<any>;

  constructor(private configService: ConfigService) {
    this.envSchema = z.object({
      NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
      PORT: z.string().transform(Number).default(() => 3000),
      API_PREFIX: z.string().default('api'),
      CORS_ORIGIN: z.string().default('*'),
      
      // Database configuration
      DATABASE_HOST: z.string().default('localhost'),
      DATABASE_PORT: z.string().transform(Number).default(() => 5432),
      DATABASE_USERNAME: z.string().default('postgres'),
      DATABASE_PASSWORD: z.string().default('password'),
      DATABASE_NAME: z.string().default('skillsync'),
      
      // JWT configuration
      JWT_SECRET: z.string().min(32).default('your-super-secret-jwt-key-change-in-production'),
      JWT_EXPIRES_IN: z.string().default('24h'),
      JWT_ACCESS_EXPIRATION: z.string().optional(),
      JWT_REFRESH_SECRET: z.string().min(32).default('your-super-secret-refresh-key'),
      JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
      
      // Redis configuration
      REDIS_HOST: z.string().default('localhost'),
      REDIS_PORT: z.string().transform(Number).default(() => 6379),
      REDIS_PASSWORD: z.string().optional(),
      REDIS_DB: z.string().transform(Number).default(() => 0),
      REDIS_KEY_PREFIX: z.string().default('skillsync'),
      REDIS_CONNECT_TIMEOUT: z.string().transform(Number).default(() => 10000),
      
      // Feature flags
      FEATURE_ENABLE_SWAGGER: z.string().transform(Boolean).default(() => true),
      FEATURE_ENABLE_CACHE: z.string().transform(Boolean).default(() => true),
      FEATURE_ENABLE_RATE_LIMITING: z.string().transform(Boolean).default(() => true),
      FEATURE_ENABLE_LOGGING: z.string().transform(Boolean).default(() => true),
      
      // Seed configuration
      DISABLE_SEED: z.string().optional(),
      DEFAULT_ADMIN_WALLET: z.string().optional(),
      
      // Logging
      LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
      LOG_FORMAT: z.enum(['json', 'simple']).default('simple'),

      // Featured Mentors Configuration
      MAX_FEATURED_MENTORS: z.string().transform(Number).default(() => 10),
      FEATURED_MENTOR_EXPIRY_DAYS: z.string().transform(Number).default(() => 30),
      
      // Encryption Configuration
      ENCRYPTION_KEY: z.string().min(32).optional(),
      ENCRYPTION_HASH_KEY: z.string().min(32).optional(),
      ENCRYPTION_SALT: z.string().optional(),
      ENCRYPTION_HASH_SALT: z.string().optional(),
    });

    this.validateEnvironment();
  }

  private validateEnvironment(): void {
    try {
      this.envSchema.parse(this.configService);
    } catch (error) {
      console.error('Environment validation failed:', error);
      process.exit(1);
    }
  }

  get<T = any>(key: string): T {
    return this.configService.get<T>(key);
  }

  // Environment methods
  isDevelopment(): boolean {
    return this.get<string>('NODE_ENV') === 'development';
  }

  isStaging(): boolean {
    return this.get<string>('NODE_ENV') === 'staging';
  }

  isProduction(): boolean {
    return this.get<string>('NODE_ENV') === 'production';
  }

  // Database methods
  getDatabaseConfig() {
    return {
      host: this.get<string>('DATABASE_HOST'),
      port: this.get<number>('DATABASE_PORT'),
      username: this.get<string>('DATABASE_USERNAME'),
      password: this.get<string>('DATABASE_PASSWORD'),
      database: this.get<string>('DATABASE_NAME'),
    };
  }

  // JWT methods
  getJwtConfig() {
    return {
      secret: this.get<string>('JWT_SECRET'),
      expiresIn: this.get<string>('JWT_EXPIRES_IN'),
      refreshSecret: this.get<string>('JWT_REFRESH_SECRET'),
      refreshExpiresIn: this.get<string>('JWT_REFRESH_EXPIRES_IN'),
    };
  }

  // Redis methods
  getRedisConfig() {
    return {
      host: this.get<string>('REDIS_HOST'),
      port: this.get<number>('REDIS_PORT'),
      password: this.get<string>('REDIS_PASSWORD'),
      db: this.get<number>('REDIS_DB'),
      keyPrefix: this.get<string>('REDIS_KEY_PREFIX'),
      connectTimeout: this.get<number>('REDIS_CONNECT_TIMEOUT'),
    };
  }

  // Feature flags methods
  isFeatureEnabled(feature: string): boolean {
    const featureKey = `FEATURE_ENABLE_${feature.toUpperCase()}`;
    return this.get<boolean>(featureKey) || false;
  }

  // Featured Mentors configuration methods
  getFeaturedMentorsConfig() {
    return {
      maxFeaturedMentors: this.get<number>('MAX_FEATURED_MENTORS'),
      expiryDays: this.get<number>('FEATURED_MENTOR_EXPIRY_DAYS'),
    };
  }

  // Encryption configuration methods
  getEncryptionConfig() {
    return {
      encryptionKey: this.get<string>('ENCRYPTION_KEY'),
      hashKey: this.get<string>('ENCRYPTION_HASH_KEY'),
      salt: this.get<string>('ENCRYPTION_SALT'),
      hashSalt: this.get<string>('ENCRYPTION_HASH_SALT'),
    };
  }
}
