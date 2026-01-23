import * as crypto from 'crypto';

export class TokenUtil {
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static isExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt;
  }
}
