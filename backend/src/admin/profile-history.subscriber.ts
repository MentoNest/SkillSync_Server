import { DataSource, EntitySubscriberInterface, EventSubscriber, UpdateEvent } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { ChangeReason, ProfileHistory } from '../users/entities/profile-history.entity';

const TRACKED_FIELDS: (keyof User)[] = ['isVerified', 'verifiedAt', 'verifiedBy', 'verificationNotes'];

@Injectable()
@EventSubscriber()
export class ProfileHistorySubscriber implements EntitySubscriberInterface<User> {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return User;
  }

  async afterUpdate(event: UpdateEvent<User>): Promise<void> {
    const entity = event.entity as Partial<User> | undefined;
    const databaseEntity = event.databaseEntity as Partial<User> | undefined;
    if (!entity || !databaseEntity) return;

    const userId = (entity.id ?? databaseEntity.id) as string | undefined;
    if (!userId) return;

    const changedBy = (entity.verifiedBy ?? databaseEntity.verifiedBy ?? 'system') as string;
    const changeReason = entity.verifiedBy ? ChangeReason.ADMIN_EDIT : ChangeReason.SYSTEM;

    const entries: ProfileHistory[] = [];
    for (const field of TRACKED_FIELDS) {
      const oldVal = databaseEntity[field];
      const newVal = entity[field];
      if (newVal !== undefined && oldVal !== newVal) {
        const entry = new ProfileHistory();
        entry.userId = userId;
        entry.fieldName = field;
        entry.oldValue = oldVal ?? null;
        entry.newValue = newVal ?? null;
        entry.changedBy = changedBy;
        entry.changeReason = changeReason;
        entry.changedAt = new Date();
        entries.push(entry);
      }
    }

    if (entries.length > 0) {
      await event.manager.save(ProfileHistory, entries);
    }
  }
}
