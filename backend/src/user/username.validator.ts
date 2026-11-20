/**
 * All username validation rules in one place so the DTO, service, and tests share
 * the same logic without duplication.
 *
 * Rules:
 *  - 3–30 characters
 *  - Only alphanumeric characters, underscores (_), and dashes (-)
 *  - No two consecutive special characters (__ -- -_ _- are all rejected)
 *  - Cannot start or end with a special character
 */

export const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]$|^[a-zA-Z0-9]{3}$/;
export const CONSECUTIVE_SPECIAL = /[_-]{2,}/;

export type UsernameValidationError =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_CHARS'
  | 'STARTS_WITH_SPECIAL'
  | 'ENDS_WITH_SPECIAL'
  | 'CONSECUTIVE_SPECIAL';

export interface UsernameValidationResult {
  valid: boolean;
  error?: UsernameValidationError;
  message?: string;
}

export function validateUsername(username: string): UsernameValidationResult {
  if (username.length < 3) {
    return { valid: false, error: 'TOO_SHORT', message: 'Username must be at least 3 characters.' };
  }
  if (username.length > 30) {
    return { valid: false, error: 'TOO_LONG', message: 'Username must not exceed 30 characters.' };
  }
  if (/[^a-zA-Z0-9_-]/.test(username)) {
    return {
      valid: false,
      error: 'INVALID_CHARS',
      message: 'Username may only contain letters, digits, underscores, and dashes.',
    };
  }
  if (/^[_-]/.test(username)) {
    return {
      valid: false,
      error: 'STARTS_WITH_SPECIAL',
      message: 'Username must start with a letter or digit.',
    };
  }
  if (/[_-]$/.test(username)) {
    return {
      valid: false,
      error: 'ENDS_WITH_SPECIAL',
      message: 'Username must end with a letter or digit.',
    };
  }
  if (CONSECUTIVE_SPECIAL.test(username)) {
    return {
      valid: false,
      error: 'CONSECUTIVE_SPECIAL',
      message: 'Username must not contain consecutive underscores or dashes.',
    };
  }
  return { valid: true };
}
