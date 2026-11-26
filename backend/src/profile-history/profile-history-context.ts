import { AsyncLocalStorage } from 'async_hooks';
import { ChangeReason } from './profile-history.entity';

/**
 * Per-request context used by the TypeORM subscriber to attribute changes
 * to the correct actor without threading extra parameters through every
 * service method.
 *
 * Usage:
 *   - Set once per HTTP request in `ProfileHistoryContextMiddleware`.
 *   - Read by `UserEntitySubscriber` when it records a history entry.
 *   - Falls back to `{ changedBy: 'system', reason: ChangeReason.SYSTEM }`
 *     when no context is active (migrations, seeds, tests).
 */
export interface ProfileHistoryContext {
  /** Wallet address of the authenticated user, or 'system'. */
  changedBy: string;
  reason: ChangeReason;
}

export const SYSTEM_CONTEXT: ProfileHistoryContext = {
  changedBy: 'system',
  reason: ChangeReason.SYSTEM,
};

export const profileHistoryStorage =
  new AsyncLocalStorage<ProfileHistoryContext>();

/** Returns the active context, or the system fallback. */
export function getProfileHistoryContext(): ProfileHistoryContext {
  return profileHistoryStorage.getStore() ?? SYSTEM_CONTEXT;
}
