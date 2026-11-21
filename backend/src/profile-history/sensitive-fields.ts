import { REDACTED } from '../common/logging/redact';

/**
 * Fields on the User entity whose values must never appear in profile history.
 *
 * The set is intentionally conservative: wallet addresses are public keys and
 * are safe to store (they appear in every history row as `userId`).  Add field
 * names here as new sensitive columns are introduced on tracked entities.
 *
 * Names must match the TypeORM property names (camelCase), not the column names.
 */
export const REDACTED_USER_FIELDS: ReadonlySet<string> = new Set([
  // No fields are currently sensitive on User, but the infrastructure is in place.
  // Example: 'email', 'phoneNumber'
]);

/**
 * Returns the value as-is for non-sensitive fields, or the REDACTED sentinel
 * for sensitive ones.
 */
export function maybeRedact(fieldName: string, value: unknown): unknown {
  if (REDACTED_USER_FIELDS.has(fieldName)) return REDACTED;
  return value;
}
