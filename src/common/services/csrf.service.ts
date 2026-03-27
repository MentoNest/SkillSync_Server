import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);

  /**
   * Generate a secure CSRF token
   * @returns 32-character hexadecimal string
   */
  generateToken(): string {
    const token = randomBytes(16).toString('hex');
    this.logger.debug(`Generated CSRF token: ${token.substring(0, 8)}...`);
    return token;
  }

  /**
   * Validate CSRF tokens
   * @param headerToken Token from request header
   * @param cookieToken Token from cookie
   * @returns boolean indicating if tokens are valid and match
   */
  validateTokens(headerToken: string, cookieToken: string): boolean {
    if (!headerToken || !cookieToken) {
      this.logger.warn('CSRF validation failed: missing tokens');
      return false;
    }

    if (headerToken !== cookieToken) {
      this.logger.warn('CSRF validation failed: token mismatch');
      return false;
    }

    this.logger.debug('CSRF tokens validated successfully');
    return true;
  }
}