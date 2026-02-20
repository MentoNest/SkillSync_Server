import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  get port(): number {
    return parseInt(process.env.PORT ?? '3000', 10);
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV ?? 'development';
  }

  /**
   * 🌍 CORS Configuration
   */
  get corsOrigins(): string[] {
    return (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get corsMethods(): string[] {
    return (process.env.CORS_METHODS ?? 'GET,POST,PUT,PATCH,DELETE')
      .split(',')
      .map((method) => method.trim());
  }

  get corsCredentials(): boolean {
    return process.env.CORS_CREDENTIALS === 'true';
  }

  /**
   * 🔐 JWT Configuration
   */
  get jwtSecret(): string {
    return process.env.JWT_SECRET ?? 'default-secret-change-in-production';
  }

  get jwtExpiresIn(): string {
    return process.env.JWT_EXPIRES_IN ?? '1h';
  }
}
