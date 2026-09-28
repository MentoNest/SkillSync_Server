import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedField {
  iv: string;
  data: string;
  tag: string;
  salt: string;
}

export interface EncryptionConfig {
  key: string;
  salt?: string;
}

@Injectable()
export class EncryptionService implements OnModuleDestroy {
  private readonly masterKey: Buffer;
  private readonly keyRotationKeys: Buffer[] = [];

  constructor() {
    const keyEnv = process.env.ENCRYPTION_KEY;
    if (!keyEnv) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    this.masterKey = Buffer.from(keyEnv, 'hex');

    const rotationKeysEnv = process.env.ENCRYPTION_KEY_ROTATION;
    if (rotationKeysEnv) {
      const keys = rotationKeysEnv.split(',').filter(Boolean);
      for (const key of keys) {
        this.keyRotationKeys.push(Buffer.from(key.trim(), 'hex'));
      }
    }
  }

  /**
   * Encrypt a string field using AES-256-GCM
   */
  encrypt(plaintext: string): EncryptedField {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    const key = this.deriveKey(this.masterKey, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      tag: tag.toString('hex'),
      salt: salt.toString('hex'),
    };
  }

  /**
   * Decrypt an encrypted field
   */
  decrypt(encrypted: EncryptedField): string {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const data = Buffer.from(encrypted.data, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');
    const salt = Buffer.from(encrypted.salt, 'hex');

    let key = this.deriveKey(this.masterKey, salt);

    let decipher: crypto.DecipherGCM;
    try {
      decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAuthTag(tag);
    } catch {
      // Try rotation keys if primary fails
      for (const rotationKey of this.keyRotationKeys) {
        try {
          key = this.deriveKey(rotationKey, salt);
          decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
            authTagLength: TAG_LENGTH,
          });
          decipher.setAuthTag(tag);
          break;
        } catch {
          continue;
        }
      }
      if (!decipher!) {
        throw new Error('Failed to decrypt: all keys exhausted');
      }
    }

    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Generate a deterministic hash for searchable encryption
   * Used for exact-match lookups (e.g., email search)
   */
  hashForSearch(value: string): string {
    const salt = process.env.SEARCH_HASH_SALT || 'default-salt-change-in-production';
    return crypto
      .createHmac('sha256', salt)
      .update(value.toLowerCase().trim())
      .digest('hex');
  }

  /**
   * Encrypt sensitive fields in an entity object
   */
  encryptFields<T extends Record<string, any>>(
    entity: T,
    fields: (keyof T)[],
  ): T {
    const result = { ...entity };
    for (const field of fields) {
      const value = result[field];
      if (value !== null && value !== undefined && typeof value === 'string') {
        (result as any)[field] = JSON.stringify(this.encrypt(value));
      }
    }
    return result;
  }

  /**
   * Decrypt sensitive fields in an entity object
   */
  decryptFields<T extends Record<string, any>>(
    entity: T,
    fields: (keyof T)[],
  ): T {
    const result = { ...entity };
    for (const field of fields) {
      const value = result[field];
      if (value !== null && value !== undefined && typeof value === 'string') {
        try {
          const encrypted: EncryptedField = JSON.parse(value);
          if (encrypted.iv && encrypted.data && encrypted.tag && encrypted.salt) {
            (result as any)[field] = this.decrypt(encrypted);
          }
        } catch {
          // Not encrypted data, skip
        }
      }
    }
    return result;
  }

  /**
   * Generate a new encryption key (for rotation)
   */
  static generateKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
  }

  /**
   * Derive an encryption key using PBKDF2
   */
  private deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  }

  onModuleDestroy() {
    // Securely clear keys from memory
    this.masterKey.fill(0);
    for (const key of this.keyRotationKeys) {
      key.fill(0);
    }
  }
}
