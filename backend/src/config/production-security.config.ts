import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';

const DEVELOPMENT_JWT_SECRET = randomBytes(32).toString('base64url');
const DEVELOPMENT_SEARCH_HASH_SALT = randomBytes(32).toString('base64url');
const DEVELOPMENT_ENCRYPTION_KEY = randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must contain at least 32 characters in production');
    }
  }
  if (secret) return secret;
  return DEVELOPMENT_JWT_SECRET;
}

export function getSearchHashSalt(): string {
  const salt = process.env.SEARCH_HASH_SALT?.trim();
  if (salt) return salt;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SEARCH_HASH_SALT must be configured in production');
  }
  return DEVELOPMENT_SEARCH_HASH_SALT;
}

export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY?.trim();
  if (key) {
    if (!/^[\da-f]{64}$/i.test(key)) {
      throw new Error('ENCRYPTION_KEY must contain exactly 64 hexadecimal characters');
    }
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be configured in production');
  }
  return DEVELOPMENT_ENCRYPTION_KEY;
}

export function parseTrustProxy(value?: string): false | number | string {
  const setting = value?.trim();
  if (!setting || setting.toLowerCase() === 'false') return false;
  if (['true', '*', '0.0.0.0/0', '::/0'].includes(setting.toLowerCase())) {
    throw new Error('TRUST_PROXY must name trusted hops or networks; trusting all proxies is unsafe');
  }
  if (/^\d+$/.test(setting)) return Number(setting);
  return setting;
}

export function getAuthCookieOptions(
  environment = process.env.NODE_ENV ?? 'development',
): CookieOptions {
  return {
    httpOnly: true,
    secure: environment !== 'development' && environment !== 'test',
    sameSite: 'strict',
    path: '/',
  };
}