import { Logger } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS Configuration Service
 * Handles Cross-Origin Resource Sharing configuration with strict security
 */
export class CorsConfig {
  private readonly logger = new Logger(CorsConfig.name);

  /**
   * Get CORS options for NestJS app.enableCors()
   */
  static getCorsOptions(
    allowedOrigins: string[],
    allowedMethods: string[],
    credentials: boolean,
    isDevelopment: boolean,
  ): CorsOptions {
    return {
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }

        // Check if origin is in whitelist
        const isAllowed = CorsConfig.isOriginAllowed(
          origin,
          allowedOrigins,
          isDevelopment,
        );

        if (isAllowed) {
          callback(null, true);
        } else {
          const logger = new Logger(CorsConfig.name);
          logger.warn(`🚫 CORS rejected - Unauthorized origin: ${origin}`);
          callback(new Error('Origin not allowed by CORS policy'));
        }
      },

      // HTTP methods allowed
      methods: allowedMethods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

      // Allow credentials (cookies, authorization headers)
      credentials: credentials ?? true,

      // Headers that clients can send
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-CSRF-Token',
        'X-Requested-With',
        'User-Agent',
      ],

      // Headers to expose to the client
      exposedHeaders: [
        'X-Total-Count', // For pagination
        'X-Page-Count',
        'X-Request-Id',
        'Content-Length',
      ],

      // Cache preflight requests for 10 minutes (600 seconds)
      // This reduces the number of OPTIONS requests
      maxAge: 600,

      // Handle requests with credentials
      preflightContinue: false,

      // Send 204 No Content for successful preflight requests
      optionsSuccessStatus: 204,
    };
  }

  /**
   * Check if an origin is allowed
   * Supports exact match and wildcard patterns for development
   */
  private static isOriginAllowed(
    origin: string,
    allowedOrigins: string[],
    isDevelopment: boolean,
  ): boolean {
    // Direct match
    if (allowedOrigins.includes(origin)) {
      return true;
    }

    // In development, allow common localhost origins
    if (isDevelopment) {
      const localhostPatterns = [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^http:\/\/\[::1\]:\d+$/, // IPv6 localhost
      ];

      if (localhostPatterns.some((pattern) => pattern.test(origin))) {
        return true;
      }
    }

    // Check for wildcard patterns (e.g., https://*.example.com)
    const isWildcardMatch = allowedOrigins.some((allowedOrigin) => {
      if (!allowedOrigin.includes('*')) {
        return false;
      }

      // Convert wildcard pattern to regex
      const regexPattern = allowedOrigin
        .replace(/\./g, '\\.') // Escape dots
        .replace(/\*/g, '.*'); // Convert * to .*

      return new RegExp(`^${regexPattern}$`).test(origin);
    });

    return isWildcardMatch;
  }

  /**
   * Get all allowed origins including development origins
   */
  static getAllowedOrigins(
    configuredOrigins: string[],
    isDevelopment: boolean,
  ): string[] {
    const origins = [...configuredOrigins];

    if (isDevelopment) {
      // Add common development origins if not already present
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
        if (!origins.includes(devOrigin)) {
          origins.push(devOrigin);
        }
      }
    }

    return origins;
  }

  /**
   * Validate CORS configuration
   */
  static validateCorsConfig(
    origins: string[],
    methods: string[],
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!origins || origins.length === 0) {
      errors.push('At least one CORS origin must be configured');
    }

    if (!methods || methods.length === 0) {
      errors.push('At least one HTTP method must be configured');
    }

    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    const invalidMethods = methods.filter(
      (method) => !validMethods.includes(method.toUpperCase()),
    );

    if (invalidMethods.length > 0) {
      errors.push(
        `Invalid HTTP methods: ${invalidMethods.join(', ')}. Valid methods: ${validMethods.join(', ')}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
