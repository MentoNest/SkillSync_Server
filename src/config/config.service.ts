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
    return parseInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? '100', 10);
  }

  get rateLimitPerIpWindowMs(): number {
    return parseInt(process.env.RATE_LIMIT_PER_IP_WINDOW_MS ?? '60000', 10);
  }

  get rateLimitPerIpMax(): number {
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
}