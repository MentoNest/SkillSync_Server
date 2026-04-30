import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;
  private readonly authTagLength = 16;
  private readonly saltLength = 16;
  private key: Buffer;
  private hashKey: Buffer;
  private initialized = false;

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys(): void {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const hashKey = process.env.ENCRYPTION_HASH_KEY;

    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    if (!hashKey) {
      throw new Error('ENCRYPTION_HASH_KEY environment variable is required');
    }

    // Derive encryption key using scryptSync (synchronous for simplicity)
    const { scryptSync } = require('crypto');
    const salt = Buffer.from(process.env.ENCRYPTION_SALT || 'default-salt-change-in-production', 'utf-8');
    this.key = scryptSync(encryptionKey, salt, this.keyLength);
    
    // Derive hash key for deterministic hashing
    const hashSalt = Buffer.from(process.env.ENCRYPTION_HASH_SALT || 'default-hash-salt-change-in-production', 'utf-8');
    this.hashKey = scryptSync(hashKey, hashSalt, this.keyLength);

    this.initialized = true;
    this.logger.log('Encryption service initialized successfully');
  }

  /**
   * Encrypts a value using AES-256-GCM
   * @param plaintext The value to encrypt
   * @returns Encrypted value as base64 string (iv:authTag:ciphertext)
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined) {
      return null;
    }

    const startTime = Date.now();
    
    try {
      const iv = randomBytes(this.ivLength);
      const cipher = createCipheriv(this.algorithm, this.key, iv);
      
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
      ciphertext += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      // Format: iv:authTag:ciphertext (all base64 encoded)
      const encrypted = `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
      
      const duration = Date.now() - startTime;
      if (duration > 10) {
        this.logger.warn(`Encryption took ${duration}ms (threshold: 10ms)`);
      }
      
      return encrypted;
    } catch (error) {
      this.logger.error('Encryption failed', error.stack);
      throw new Error('Failed to encrypt value');
    }
  }

  /**
   * Decrypts a value encrypted with AES-256-GCM
   * @param encrypted The encrypted value (iv:authTag:ciphertext)
   * @returns Decrypted plaintext string
   */
  decrypt(encrypted: string | null | undefined): string | null {
    if (encrypted === null || encrypted === undefined) {
      return null;
    }

    const startTime = Date.now();

    try {
      const [ivBase64, authTagBase64, ciphertext] = encrypted.split(':');
      
      if (!ivBase64 || !authTagBase64 || !ciphertext) {
        throw new Error('Invalid encrypted format');
      }

      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');
      
      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      
      let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
      plaintext += decipher.final('utf8');
      
      const duration = Date.now() - startTime;
      if (duration > 10) {
        this.logger.warn(`Decryption took ${duration}ms (threshold: 10ms)`);
      }
      
      return plaintext;
    } catch (error) {
      this.logger.error('Decryption failed', error.stack);
      throw new Error('Failed to decrypt value');
    }
  }

  /**
   * Creates a deterministic hash for searchable encrypted fields
   * Used for exact match queries (e.g., email lookups)
   * @param value The value to hash
   * @returns Hex-encoded hash string
   */
  createSearchHash(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const { createHmac } = require('crypto');
    const hmac = createHmac('sha256', this.hashKey);
    hmac.update(value.toLowerCase().trim()); // Normalize for consistent hashing
    return hmac.digest('hex');
  }

  /**
   * Encrypts an object's sensitive fields
   * @param obj The object to encrypt
   * @param fields Array of field names to encrypt
   * @returns New object with encrypted fields
   */
  encryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
    const encrypted = { ...obj };
    
    for (const field of fields) {
      const value = obj[field];
      if (typeof value === 'string') {
        encrypted[field] = this.encrypt(value) as any;
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypts an object's sensitive fields
   * @param obj The object to decrypt
   * @param fields Array of field names to decrypt
   * @returns New object with decrypted fields
   */
  decryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
    const decrypted = { ...obj };
    
    for (const field of fields) {
      const value = obj[field];
      if (typeof value === 'string') {
        decrypted[field] = this.decrypt(value) as any;
      }
    }
    
    return decrypted;
  }

  /**
   * Gets the encryption key (for migration scripts)
   */
  getKey(): Buffer {
    return this.key;
  }

  /**
   * Gets the hash key (for migration scripts)
   */
  getHashKey(): Buffer {
    return this.hashKey;
  }
}
