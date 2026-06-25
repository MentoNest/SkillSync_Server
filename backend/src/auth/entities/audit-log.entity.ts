export enum AuditEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  NONCE_EXPIRED = 'nonce_expired',
  INVALID_SIGNATURE = 'invalid_signature',
  USERNAME_CHANGED = 'username_changed',
  DISPLAY_NAME_CHANGED = 'display_name_changed',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REVOKED = 'role_revoked',
  TOKEN_INVALIDATED = 'token_invalidated',
}
