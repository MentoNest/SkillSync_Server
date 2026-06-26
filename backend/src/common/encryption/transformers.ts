import { ValueTransformer } from 'typeorm';
import { EncryptionService } from './encryption.service';

/**
 * TypeORM column transformer that transparently encrypts on write
 * and decrypts on read using the EncryptionService.
 *
 * Usage:
 *   @Column({ transformer: new EncryptedTransformer(encryptionService) })
 *   sensitiveField: string;
 */
export class EncryptedTransformer implements ValueTransformer {
  constructor(private readonly encryptionService: EncryptionService) {}

  /** Called before value is written to the database. */
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    return this.encryptionService.encrypt(value);
  }

  /** Called after value is read from the database. */
  from(value: string | null | undefined): string | null {
    if (value == null) return null;
    try {
      return this.encryptionService.decrypt(value);
    } catch {
      // If decryption fails the value was stored in plaintext (pre-migration row).
      // Return as-is so existing data continues to work until migrated.
      return value;
    }
  }
}

/**
 * TypeORM column transformer that stores a deterministic HMAC-SHA-256 hash.
 * Use this on a sibling column alongside an EncryptedTransformer column to
 * enable exact-match queries without exposing plaintext.
 *
 * Usage:
 *   @Column({ unique: true, transformer: new HashTransformer(encryptionService) })
 *   walletHash: string;
 */
export class HashTransformer implements ValueTransformer {
  constructor(private readonly encryptionService: EncryptionService) {}

  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    return this.encryptionService.hash(value);
  }

  /** Hashes are stored; the original value cannot be recovered from this column. */
  from(value: string | null | undefined): string | null {
    return value ?? null;
  }
}
