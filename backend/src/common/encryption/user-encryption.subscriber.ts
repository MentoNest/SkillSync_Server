import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  LoadEvent,
  UpdateEvent,
} from 'typeorm';
import { EncryptionService } from './encryption.service';
import { User } from '../../entities/user.entity';

/**
 * TypeORM subscriber that transparently encrypts sensitive User fields
 * before they are persisted and decrypts them after they are loaded.
 *
 * Fields encrypted: wallet
 * Hash index column:  walletHash  (used for exact-match queries)
 */
@Injectable()
@EventSubscriber()
export class UserEncryptionSubscriber
  implements EntitySubscriberInterface<User>
{
  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return User;
  }

  /** Decrypt wallet after the entity is loaded from the database. */
  afterLoad(entity: LoadEvent<User>['entity']): void {
    if (!entity) return;
    if (entity.wallet && this.isEncrypted(entity.wallet)) {
      entity.wallet = this.encryptionService.decrypt(entity.wallet);
    }
  }

  /** Encrypt wallet (and compute its hash) before INSERT. */
  beforeInsert(event: InsertEvent<User>): void {
    const entity = event.entity;
    if (entity.wallet) {
      entity.walletHash = this.encryptionService.hash(entity.wallet);
      entity.wallet = this.encryptionService.encrypt(entity.wallet);
    }
  }

  /** Encrypt wallet (and recompute its hash) before UPDATE. */
  beforeUpdate(event: UpdateEvent<User>): void {
    const entity = event.entity as User | undefined;
    if (!entity) return;
    if (entity.wallet && !this.isEncrypted(entity.wallet)) {
      entity.walletHash = this.encryptionService.hash(entity.wallet);
      entity.wallet = this.encryptionService.encrypt(entity.wallet);
    }
  }

  /**
   * Heuristic check: encrypted values are three colon-separated hex segments.
   * Stellar public keys do not contain colons, so this is safe.
   */
  private isEncrypted(value: string): boolean {
    return value.split(':').length === 3;
  }
}
