import { EntitySubscriberInterface, EventSubscriber, UpdateEvent } from 'typeorm';
import { ChangeReason, ProfileHistory, ProfileType } from './entities/profile-history.entity';
import { currentActor, redact, TRACKED_ENTITIES } from './profile-history.context';

/**
 * TypeORM subscriber that captures profile field changes automatically (#1452).
 * Registered for all entities; only entities listed in TRACKED_ENTITIES produce rows.
 */
@EventSubscriber()
export class ProfileHistorySubscriber implements EntitySubscriberInterface {
  async afterUpdate(event: UpdateEvent<unknown>): Promise<void> {
    if (!event?.entity || !event.databaseEntity || !event.metadata) return;
    const tracked = TRACKED_ENTITIES[event.metadata.name];
    if (!tracked) return;

    const actor = currentActor();
    const rows: ProfileHistory[] = [];
    for (const column of event.updatedColumns ?? []) {
      const field = column.propertyName;
      if (!tracked.fields.has(field)) continue;

      const oldValue = (event.databaseEntity as Record<string, unknown>)[field];
      const newValue = (event.entity as Record<string, unknown>)[field];
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

      rows.push(
        event.manager.create(ProfileHistory, {
          userId: this.userIdOf(event, tracked.type),
          profileType: tracked.type,
          fieldName: field,
          oldValue: redact(field, oldValue),
          newValue: redact(field, newValue),
          changedBy: actor?.changedBy ?? 'system',
          changeReason: actor?.changeReason ?? ChangeReason.SYSTEM,
        }),
      );
    }

    if (rows.length) await event.manager.save(rows);
  }

  private userIdOf(event: UpdateEvent<unknown>, type: ProfileType): string {
    const entity = event.entity as Record<string, unknown>;
    return (type === ProfileType.MENTOR ? entity.userId : entity.id) as string;
  }
}
