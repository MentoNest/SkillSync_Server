import {
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
  EventSubscriber,
} from 'typeorm';
import { EncryptionService } from './encryption.service';

const ENCRYPTED_FIELDS = ['email', 'displayName', 'bio', 'walletAddress'];
const SEARCH_HASH_FIELDS = ['email'];

/**
 * TypeORM subscriber for automatic field-level encryption
 * Encrypts sensitive fields before database storage
 * Decrypts them on entity load
 */
@EventSubscriber()
export class EncryptionSubscriber implements EntitySubscriberInterface {
  private encryptionService: EncryptionService;

  setEncryptionService(service: EncryptionService) {
    this.encryptionService = service;
  }

  /**
   * Encrypt fields before insert
   */
  beforeInsert(event: InsertEvent<any>): void {
    if (!this.encryptionService) return;

    const entity = event.entity;
    if (!entity) return;

    for (const field of ENCRYPTED_FIELDS) {
      if (entity[field] !== null && entity[field] !== undefined && typeof entity[field] === 'string') {
        const encrypted = this.encryptionService.encrypt(entity[field]);
        entity[field] = JSON.stringify(encrypted);

        // Add search hash for searchable fields
        if (SEARCH_HASH_FIELDS.includes(field)) {
          const hashField = `${field}Hash`;
          entity[hashField] = this.encryptionService.hashForSearch(entity[field]);
        }
      }
    }
  }

  /**
   * Encrypt fields before update
   */
  beforeUpdate(event: UpdateEvent<any>): void {
    if (!this.encryptionService) return;

    const entity = event.entity;
    if (!entity) return;

    for (const field of ENCRYPTED_FIELDS) {
      if (entity[field] !== null && entity[field] !== undefined && typeof entity[field] === 'string') {
        // Skip if already encrypted (check for JSON structure)
        try {
          const parsed = JSON.parse(entity[field]);
          if (parsed.iv && parsed.data && parsed.tag && parsed.salt) {
            continue;
          }
        } catch {
          // Not encrypted, proceed
        }

        const encrypted = this.encryptionService.encrypt(entity[field]);
        entity[field] = JSON.stringify(encrypted);

        if (SEARCH_HASH_FIELDS.includes(field)) {
          const hashField = `${field}Hash`;
          entity[hashField] = this.encryptionService.hashForSearch(entity[field]);
        }
      }
    }
  }

  /**
   * Decrypt fields after load
   */
  afterLoad(entity: any): void {
    if (!this.encryptionService) return;

    if (!entity) return;

    for (const field of ENCRYPTED_FIELDS) {
      if (entity[field] !== null && entity[field] !== undefined && typeof entity[field] === 'string') {
        try {
          const parsed = JSON.parse(entity[field]);
          if (parsed.iv && parsed.data && parsed.tag && parsed.salt) {
            entity[field] = this.encryptionService.decrypt(parsed);
          }
        } catch {
          // Not encrypted data
        }
      }
    }
  }
}
