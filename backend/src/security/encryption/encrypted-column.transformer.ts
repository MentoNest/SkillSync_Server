import type { ValueTransformer } from 'typeorm';
import { FieldEncryptionService } from './field-encryption.service';

let service: FieldEncryptionService | null = null;

/** Called once at startup by EncryptionModule so entities can use the transformer. */
export function configureColumnEncryption(instance: FieldEncryptionService): void {
  service = instance;
}

/**
 * TypeORM transformer: encrypts on write, decrypts on read. Values that are
 * not yet encrypted (rows written before the migration) are returned as-is,
 * so rollout does not break reads.
 *
 *   @Column({ type: 'text', transformer: encryptedColumn })
 *   email!: string;
 */
export const encryptedColumn: ValueTransformer = {
  to(value?: string | null): string | null | undefined {
    if (value === null || value === undefined) return value;
    if (!service) throw new Error('Column encryption is not configured');
    return service.isEncrypted(value) ? value : service.encrypt(value);
  },
  from(value?: string | null): string | null | undefined {
    if (value === null || value === undefined) return value;
    if (!service) throw new Error('Column encryption is not configured');
    return service.isEncrypted(value) ? service.decrypt(value) : value;
  },
};
