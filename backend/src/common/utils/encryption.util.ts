import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Retrieves the encryption key from environment variables.
 * The key must be a 64-character hex string (32 bytes).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is required for field-level encryption');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string`);
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt.
 * @returns A colon-delimited string in the format `iv:authTag:ciphertext` (all hex).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string that was encrypted with `encrypt`.
 *
 * @param encryptedString - The colon-delimited `iv:authTag:ciphertext` string.
 * @returns The original plaintext string.
 */
export function decrypt(encryptedString: string): string {
  const key = getEncryptionKey();
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Creates a deterministic SHA-256 hash of a value for searchable lookups.
 * This allows searching for encrypted fields (e.g., email) without
 * decrypting every record.
 *
 * @param value - The value to hash (e.g., email address).
 * @returns A hex-encoded SHA-256 hash.
 */
export function createSearchableHash(value: string): string {
  const key = getEncryptionKey();
  // Use HMAC-SHA256 with the encryption key to create a deterministic hash
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(value.toLowerCase().trim());
  return hmac.digest('hex');
}

/**
 * TypeORM subscriber helper: decorates entity columns that should be
 * automatically encrypted/decrypted on save/load.
 *
 * Usage example in an entity:
 * ```typescript
 * @BeforeInsert()
 * @BeforeUpdate()
 * encryptSensitiveFields() {
 *   this.email = encrypt(this.email);
 *   this.emailHash = createSearchableHash(this.email);
 * }
 *
 * @AfterLoad()
 * @AfterFind()
 * decryptSensitiveFields() {
 *   if (this.email && this.email.includes(':')) {
 *     this.email = decrypt(this.email);
 *   }
 * }
 * ```
 */
export const EncryptionUtils = {
  encrypt,
  decrypt,
  createSearchableHash,
};
