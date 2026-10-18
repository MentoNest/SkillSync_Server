import type { FindOptionsWhere } from 'typeorm';
import type { User } from '../entities/user.entity';

/** Lifecycle states for a user account (PostgreSQL ENUM `users_status_enum`). */
export enum UserStatus {
  ACTIVE = 'active',
  PENDING_VERIFICATION = 'pending_verification',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

/**
 * Allowed status transitions. `deleted` is terminal (a deleted account can never
 * become active again). Anything may be deleted; active and suspended may flip.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<UserStatus, UserStatus[]> = {
  [UserStatus.ACTIVE]: [UserStatus.PENDING_VERIFICATION, UserStatus.SUSPENDED, UserStatus.DELETED],
  [UserStatus.PENDING_VERIFICATION]: [UserStatus.ACTIVE, UserStatus.DELETED],
  [UserStatus.SUSPENDED]: [UserStatus.ACTIVE, UserStatus.DELETED],
  [UserStatus.DELETED]: [],
};

export function canTransition(from: UserStatus, to: UserStatus): boolean {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Query criteria for public endpoints that must hide non-active users. */
export const activeOnly = (): FindOptionsWhere<User> => ({ status: UserStatus.ACTIVE });
