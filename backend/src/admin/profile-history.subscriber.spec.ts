import { ProfileHistorySubscriber } from './profile-history.subscriber';
import { ChangeReason, ProfileHistory } from '../users/entities/profile-history.entity';
import { User } from '../users/entities/user.entity';
import { UpdateEvent } from 'typeorm';

const makeEvent = (entity: Partial<User>, databaseEntity: Partial<User>) => {
  const saved: ProfileHistory[] = [];
  return {
    entity,
    databaseEntity,
    manager: {
      save: jest.fn((_cls: unknown, entries: ProfileHistory[]) => {
        saved.push(...entries);
        return Promise.resolve(entries);
      }),
    },
    _saved: saved,
  } as unknown as UpdateEvent<User> & { _saved: ProfileHistory[] };
};

describe('ProfileHistorySubscriber', () => {
  let subscriber: ProfileHistorySubscriber;

  beforeEach(() => {
    const fakeDataSource = { subscribers: [] } as never;
    subscriber = new ProfileHistorySubscriber(fakeDataSource);
  });

  it('listens to User entity', () => {
    expect(subscriber.listenTo()).toBe(User);
  });

  it('captures changed tracked fields', async () => {
    const event = makeEvent(
      { id: 'u1', isVerified: true, verifiedBy: 'admin-1', verifiedAt: new Date(), verificationNotes: 'ok' },
      { id: 'u1', isVerified: false, verifiedBy: null, verifiedAt: null, verificationNotes: null },
    );

    await subscriber.afterUpdate(event);

    expect(event.manager.save).toHaveBeenCalled();
    const entries = event._saved;
    expect(entries.length).toBeGreaterThan(0);
    const isVerifiedEntry = entries.find((e) => e.fieldName === 'isVerified');
    expect(isVerifiedEntry).toBeDefined();
    expect(isVerifiedEntry!.oldValue).toBe(false);
    expect(isVerifiedEntry!.newValue).toBe(true);
    expect(isVerifiedEntry!.changeReason).toBe(ChangeReason.ADMIN_EDIT);
  });

  it('does nothing when no tracked fields changed', async () => {
    const event = makeEvent(
      { id: 'u1', isVerified: false },
      { id: 'u1', isVerified: false },
    );

    await subscriber.afterUpdate(event);

    expect(event.manager.save).not.toHaveBeenCalled();
  });

  it('skips when entity is undefined', async () => {
    const event = makeEvent(undefined as never, { id: 'u1' });
    await subscriber.afterUpdate(event);
    expect(event.manager.save).not.toHaveBeenCalled();
  });
});
