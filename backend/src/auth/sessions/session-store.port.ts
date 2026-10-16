/**
 * Storage port for refresh-token sessions. The refresh-token implementation
 * (issues #1429/#1430) provides the concrete class bound to SESSION_STORE.
 */
export const SESSION_STORE = Symbol('SESSION_STORE');

export interface SessionStore {
  /** Revoke every refresh token of the user; returns how many were revoked. */
  revokeAllForUser(userId: string): Promise<number>;
  /** Blacklist an access-token id until it would have expired anyway. */
  blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void>;
}
