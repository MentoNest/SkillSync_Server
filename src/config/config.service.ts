import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  get port(): number {
    return parseInt(process.env.PORT ?? '3000', 10);
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV ?? 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /**
   * 🔒 Trust Proxy Configuration
   * Enable when behind reverse proxy (Nginx, CloudFlare, AWS ALB)
   */
  get trustProxy(): boolean {
    return process.env.TRUST_PROXY === 'true';
  }

  /**
   * 🍪 Cookie Security Configuration
   */
  get cookieSecure(): boolean {
    // Force secure cookies in production
    return this.isProduction || process.env.COOKIE_SECURE === 'true';
  }

  get cookieHttpOnly(): boolean {
    return process.env.COOKIE_HTTP_ONLY !== 'false'; // Default to true
  }

  get cookieSameSite(): 'strict' | 'lax' | 'none' {
    const value = process.env.COOKIE_SAME_SITE ?? 'strict';
    if (value === 'none' && this.isProduction) {
      this.logger.warn('Cookie SameSite=none is not recommended for production');
    }
    return value as 'strict' | 'lax' | 'none';
  }

  get cookieDomain(): string | undefined {
    return process.env.COOKIE_DOMAIN || undefined;
  }

  get cookieMaxAge(): number {
    return parseInt(process.env.COOKIE_MAX_AGE ?? '3600000', 10); // 1 hour default
  }

  /**
   * 🌍 CORS Configuration
   * CORS_ORIGINS: Comma-separated list of allowed origins (e.g., https://example.com,https://app.example.com)
   * In development, localhost:3000-5173 are automatically allowed
   */
  get corsOrigins(): string[] {
    const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    // In development, automatically add localhost origins
    if (!this.isProduction) {
      const devOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4200',
        'http://localhost:5173', // Vite
        'http://localhost:8080', // Vue
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
      ];

      for (const devOrigin of devOrigins) {
        if (!configuredOrigins.includes(devOrigin)) {
          configuredOrigins.push(devOrigin);
        }
      }
    }

    return configuredOrigins;
  }

  /**
   * 🔄 CORS Methods Configuration
   * Comma-separated list of allowed HTTP methods
   */
  get corsMethods(): string[] {
    return (process.env.CORS_METHODS ?? 'GET,POST,PUT,PATCH,DELETE')
      .split(',')
      .map((method) => method.trim().toUpperCase());
  }

  /**
   * 🍪 CORS Credentials Configuration
   * Set to true to allow cookies and authorization headers
   */
  get corsCredentials(): boolean {
    return process.env.CORS_CREDENTIALS !== 'false'; // Default to true
  }

  /**
   * 📋 CORS Allowed Headers Configuration
   * Headers that clients are allowed to send
   */
  get corsAllowedHeaders(): string[] {
    return (
      process.env.CORS_ALLOWED_HEADERS ??
      'Content-Type,Authorization,Accept,X-CSRF-Token,X-Requested-With,User-Agent'
    )
      .split(',')
      .map((header) => header.trim());
  }

  /**
   * 📤 CORS Exposed Headers Configuration
   * Headers that will be exposed to the client
   */
  get corsExposedHeaders(): string[] {
    return (
      process.env.CORS_EXPOSED_HEADERS ??
      'X-Total-Count,X-Page-Count,X-Request-Id,Content-Length'
    )
      .split(',')
      .map((header) => header.trim());
  }

  /**
   * ⏱️ CORS Preflight Cache Duration
   * How long (in seconds) to cache preflight requests
   * Default: 600 seconds (10 minutes)
   */
  get corsPrefflightMaxAge(): number {
    return parseInt(process.env.CORS_PREFLIGHT_MAX_AGE ?? '600', 10);
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

  /**
   * 📧 Mail Configuration
   */
  get mailSender(): string {
    return process.env.MAIL_SENDER ?? 'noreply@skillsync.com';
  }

  get mailSubjectPrefix(): string {
    return process.env.MAIL_SUBJECT_PREFIX ?? '[SkillSync]';
  }

  get mailAppName(): string {
    return process.env.MAIL_APP_NAME ?? 'SkillSync';
  }

  get smtpHost(): string {
    return process.env.SMTP_HOST ?? 'smtp.example.com';
  }

  get smtpPort(): number {
    return parseInt(process.env.SMTP_PORT ?? '587', 10);
  }

  get smtpUser(): string {
    return process.env.SMTP_USER ?? '';
  }

  get smtpPassword(): string {
    return process.env.SMTP_PASSWORD ?? '';
  }

  get smtpSecure(): boolean {
    return process.env.SMTP_SECURE === 'true';
  }

  get otpTtlMinutes(): number {
    return parseInt(process.env.OTP_TTL_MINUTES ?? '10', 10);
  }

  get otpSubject(): string {
    return process.env.OTP_SUBJECT ?? 'Your One-Time Password (OTP)';
  }

  /**
   * 🚦 Rate Limiting Configuration
   */
  get rateLimitEnabled(): boolean {
    return process.env.RATE_LIMIT_ENABLED !== 'false';
  }

  get rateLimitGlobalWindowMs(): number {
    return parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ?? '60000', 10);
  }

  get rateLimitGlobalMax(): number {
    // Stricter in production
    if (this.isProduction) {
      return parseInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? '50', 10);
    }
    return parseInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? '100', 10);
  }

  get rateLimitPerIpWindowMs(): number {
    return parseInt(process.env.RATE_LIMIT_PER_IP_WINDOW_MS ?? '60000', 10);
  }

  get rateLimitPerIpMax(): number {
    // Stricter for unauthenticated users in production
    if (this.isProduction) {
      return parseInt(process.env.RATE_LIMIT_PER_IP_MAX ?? '10', 10);
    }
    return parseInt(process.env.RATE_LIMIT_PER_IP_MAX ?? '100', 10);
  }

  get rateLimitPerWalletWindowMs(): number {
    return parseInt(process.env.RATE_LIMIT_PER_WALLET_WINDOW_MS ?? '60000', 10);
  }

  get rateLimitPerWalletMax(): number {
    return parseInt(process.env.RATE_LIMIT_PER_WALLET_MAX ?? '50', 10);
  }

  get rateLimitPerUserWindowMs(): number {
    return parseInt(process.env.RATE_LIMIT_PER_USER_WINDOW_MS ?? '60000', 10);
  }

  get rateLimitPerUserMax(): number {
    // Stricter for authenticated users in production
    if (this.isProduction) {
      return parseInt(process.env.RATE_LIMIT_PER_USER_MAX ?? '50', 10);
    }
    return parseInt(process.env.RATE_LIMIT_PER_USER_MAX ?? '200', 10);
  }

  get rateLimitStrictMax(): number {
    return parseInt(process.env.RATE_LIMIT_STRICT_MAX ?? '10', 10);
  }

  get rateLimitRelaxedMax(): number {
    return parseInt(process.env.RATE_LIMIT_RELAXED_MAX ?? '1000', 10);
  }

  get rateLimitExemptPaths(): string[] {
    return (process.env.RATE_LIMIT_EXEMPT_PATHS ?? '/health,/health/redis')
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
  }

  /**
   * 🛑 Graceful Shutdown Configuration
   */
  get shutdownTimeout(): number {
    return parseInt(process.env.SHUTDOWN_TIMEOUT ?? '30000', 10); // Default 30 seconds
  }

  /**
   * 🔐 Validate all critical secrets are present
   * Call this at application startup in production
   */
  validateSecrets(): void {
    const requiredSecrets = [
      { key: 'JWT_SECRET', value: this.jwtSecret },
      { key: 'DB_PASSWORD', value: process.env.DB_PASSWORD },
      { key: 'CORS_ORIGINS', value: process.env.CORS_ORIGINS },
    ];

    const missingSecrets = requiredSecrets.filter(
      (secret) => !secret.value || secret.value.trim() === '',
    );

    if (missingSecrets.length > 0) {
      const missingKeys = missingSecrets.map((s) => s.key).join(', ');
      throw new Error(
        `Missing required environment variables: ${missingKeys}`,
      );
    }

    // Warn about weak secrets in production
    if (this.isProduction) {
      if (this.jwtSecret.includes('default') || this.jwtSecret.length < 32) {
        this.logger.error(
          '⚠️  JWT_SECRET is weak or uses default value. Use a strong, random secret (min 32 chars)',
        );
      }
    }

    this.logger.log('✅ All required secrets validated');
  }
}