import { AsyncLocalStorage } from 'async_hooks';
import { ChangeReason, ProfileType } from './entities/profile-history.entity';

export interface ProfileHistoryActor {
  changedBy: string;
  changeReason: ChangeReason;
}

const storage = new AsyncLocalStorage<ProfileHistoryActor>();

/** Run a callback with the acting user recorded on any captured history rows. */
export function runAsActor<T>(actor: ProfileHistoryActor, fn: () => T): T {
  return storage.run(actor, fn);
}

export function currentActor(): ProfileHistoryActor | undefined {
  return storage.getStore();
}

export const REDACTED = '[REDACTED]';

/** Values that must never be written to history verbatim. */
export const SENSITIVE_FIELDS = new Set(['walletAddress', 'tokenVersion', 'email']);

interface TrackedEntityConfig {
  type: ProfileType;
  fields: Set<string>;
}

/**
 * Fields captured per entity. User updates also touch operational columns such as
 * `lastLoginAt`; those are intentionally excluded to keep the trail meaningful.
 */
export const TRACKED_ENTITIES: Record<string, TrackedEntityConfig> = {
  MentorProfile: {
    type: ProfileType.MENTOR,
    fields: new Set([
      'bio',
      'skills',
      'hourlyRate',
      'expertiseAreas',
      'yearsOfExperience',
      'currentRole',
      'company',
      'education',
      'certifications',
      'languages',
      'mentoringStyle',
      'isVerified',
      'averageRating',
      'reviewCount',
    ]),
  },
  User: {
    type: ProfileType.MENTEE,
    fields: new Set(['displayName', 'avatarUrl', 'status', 'deletedAt', 'walletAddress', 'email']),
  },
};

/** Masks sensitive field values while still recording that a change happened. */
export function redact(field: string, value: unknown): unknown {
  return SENSITIVE_FIELDS.has(field) && value != null ? REDACTED : value;
}
