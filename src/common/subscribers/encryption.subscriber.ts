import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  LoadEvent,
} from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../services/encryption.service';
import { getEncryptFields, getHashFields } from '../decorators/encrypt.decorator';

/**
 * TypeORM subscriber that automatically encrypts/decrypts entity fields
 * marked with @Encrypt() or @EncryptAndHash() decorators
 */
@EventSubscriber()
@Injectable()
export class EncryptionSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(EncryptionSubscriber.name);

  constructor(private readonly encryptionService: EncryptionService) {}

  /**
   * Listen to all entities
   */
  listenTo() {
    return Object;
  }

  /**
   * Before inserting an entity - encrypt marked fields
   */
  beforeInsert(event: InsertEvent<any>): void {
    this.encryptEntity(event.entity);
  }

  /**
   * Before updating an entity - encrypt marked fields
   */
  beforeUpdate(event: UpdateEvent<any>): void {
    this.encryptEntity(event.entity);
  }

  /**
   * After loading an entity - decrypt marked fields
   */
  afterLoad(entity: any): void {
    if (!entity) {
      return;
    }

    const encryptFields = getEncryptFields(entity.constructor);
    
    if (encryptFields.length === 0) {
      return;
    }

    try {
      for (const field of encryptFields) {
        const encryptedValue = entity[field];
        if (encryptedValue && typeof encryptedValue === 'string') {
          entity[field] = this.encryptionService.decrypt(encryptedValue);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to decrypt entity ${entity.constructor.name}`, error.stack);
    }
  }

  /**
   * Encrypt all marked fields on an entity
   */
  private encryptEntity(entity: any): void {
    if (!entity) {
      return;
    }

    const encryptFields = getEncryptFields(entity.constructor);
    const hashFields = getHashFields(entity.constructor);

    if (encryptFields.length === 0) {
      return;
    }

    try {
      // Encrypt marked fields
      for (const field of encryptFields) {
        const value = entity[field];
        if (value && typeof value === 'string') {
          entity[field] = this.encryptionService.encrypt(value);
        }
      }

      // Create hash for searchable fields
      for (const field of hashFields) {
        const value = entity[field];
        const hashField = `${field}Hash`;
        
        if (value && typeof value === 'string') {
          // Only set hash if it's a plaintext value (not already encrypted)
          // Check if value looks like our encrypted format (base64:base64:base64)
          const isAlreadyEncrypted = value.includes(':') && value.split(':').length === 3;
          
          if (!isAlreadyEncrypted) {
            entity[hashField] = this.encryptionService.createSearchHash(value);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to encrypt entity ${entity.constructor.name}`, error.stack);
      throw error;
    }
  }
}
