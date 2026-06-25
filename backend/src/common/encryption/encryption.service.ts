import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Field-level AES-256-GCM encryption service.
 *
 * Environment variables:
 *   ENCRYPTION_KEY  – 64-char hex string (32 bytes). Required for encrypt/decrypt.
 *   ENCRYPTION_HMAC_KEY – 64-char hex string (32 bytes). Required for deterministic hash.
 *
 * Encrypted value format (colon-separated hex segments):
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor() {
    const rawKey = process.env.ENCRYPTION_KEY;
    const rawHmac = process.env.ENCRYPTION_HMAC_KEY;

    if (!rawKey || rawKey.length !== 64) {
      this.logger.warn(
        'ENCRYPTION_KEY is missing or not 64 hex chars – encryption is disabled',
      );
    }
    if (!rawHmac || rawHmac.length !== 64) {
      this.logger.warn(
        'ENCRYPTION_HMAC_KEY is missing or not 64 hex chars – hashing is disabled',
      );
    }

    this.key = rawKey ? Buffer.from(rawKey, 'hex') : Buffer.alloc(32);
    this.hmacKey = rawHmac ? Buffer.from(rawHmac, 'hex') : Buffer.alloc(32);
  }

  /**
   * Encrypt plaintext with AES-256-GCM.
   * Returns a colon-separated string: iv:authTag:ciphertext (all hex).
   * Performance overhead is typically < 1ms for short strings.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt a value produced by encrypt().
   * Throws if the ciphertext has been tampered with (GCM authentication tag fails).
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted value format');
    }
    const [ivHex, authTagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  /**
   * Deterministic HMAC-SHA-256 hash for use in indexed columns.
   * Allows exact-match queries on encrypted fields without storing plaintext.
   */
  hash(value: string): string {
    return createHmac('sha256', this.hmacKey)
      .update(value, 'utf8')
      .digest('hex');
  }
}
