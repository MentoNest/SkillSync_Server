import { Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { User } from '../user/user.entity';
import { getProfileHistoryContext } from './profile-history-context';
import { ChangeReason } from './profile-history.entity';
import { ProfileHistoryService, RecordChangeOptions } from './profile-history.service';

/**
 * Fields on User that we do NOT want to track.
 *
 * - `createdAt`         — set once, never changes, not a profile edit
 * - `usernameChangedAt` — internal implementation detail of the cooldown; the
 *                         change to `username` itself is already recorded
 */
const IGNORED_FIELDS: ReadonlySet<string> = new Set(['createdAt', 'usernameChangedAt']);

/**
 * TypeORM subscriber that automatically records a ProfileHistory entry for
 * every tracked field that changes on the User entity.
 *
 * How it works:
 *  - `afterInsert` fires when a brand-new user row is created.  Every non-null
 *    field is recorded as an initial write (oldValue = null).
 *  - `afterUpdate` fires after `Repository.save()` on an existing row. TypeORM
 *    populates `event.databaseEntity` (the state before the save) only when it
 *    can pre-load the row — which it does for `save()` with a primary-key-bearing
 *    entity.  We diff new vs old and record only changed fields.
 *
 * The subscriber is registered with the DataSource in its constructor so NestJS
 * DI can inject `ProfileHistoryService` before the subscriber is active.
 */
@Injectable()
@EventSubscriber()
export class UserEntitySubscriber implements EntitySubscriberInterface<User> {
  private readonly logger = new Logger(UserEntitySubscriber.name);

  constructor(
    dataSource: DataSource,
    private readonly historyService: ProfileHistoryService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return User;
  }

  async afterInsert(event: InsertEvent<User>): Promise<void> {
    const user = event.entity;
    if (!user) return;

    const ctx = getProfileHistoryContext();
    const changedAt = new Date();

    const entries: RecordChangeOptions[] = [];

    for (const [field, value] of Object.entries(user) as [keyof User, unknown][]) {
      if (IGNORED_FIELDS.has(field as string)) continue;
      if (field === 'walletAddress') continue; // PK — not a "change"
      if (value === null || value === undefined) continue;

      entries.push({
        userId: user.walletAddress,
        profileType: 'user',
        fieldName: field as string,
        oldValue: null,
        newValue: value,
        changedBy: ctx.changedBy,
        changeReason: ctx.reason,
        changedAt,
      });
    }

    if (entries.length > 0) {
      await this.historyService.recordMany(entries);
    }
  }

  async afterUpdate(event: UpdateEvent<User>): Promise<void> {
    const updated = event.entity as User | undefined;
    const previous = event.databaseEntity as User | undefined;

    if (!updated || !previous) {
      this.logger.warn(
        'UserEntitySubscriber.afterUpdate: missing entity or databaseEntity — skipping history capture.',
      );
      return;
    }

    const ctx = getProfileHistoryContext();
    const changedAt = new Date();
    const entries: RecordChangeOptions[] = [];

    // Walk the columns TypeORM knows about for this entity.
    const columns = event.metadata.columns;
    for (const col of columns) {
      const field = col.propertyName;
      if (IGNORED_FIELDS.has(field)) continue;
      if (field === 'walletAddress') continue;

      const oldVal = (previous as Record<string, unknown>)[field];
      const newVal = (updated as Record<string, unknown>)[field];

      // Deep-equality: JSON stringify is reliable here because all User fields
      // are primitives (string | null | Date).  Dates are compared by value.
      const oldSerialized = oldVal instanceof Date ? oldVal.toISOString() : oldVal;
      const newSerialized = newVal instanceof Date ? newVal.toISOString() : newVal;

      if (oldSerialized === newSerialized) continue;

      entries.push({
        userId: updated.walletAddress,
        profileType: 'user',
        fieldName: field,
        oldValue: oldSerialized ?? null,
        newValue: newSerialized ?? null,
        changedBy: ctx.changedBy,
        changeReason: ctx.reason,
        changedAt,
      });
    }

    if (entries.length > 0) {
      await this.historyService.recordMany(entries);
    }
  }
}
