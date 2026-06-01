export function isValidUsername(username: string): boolean {
  /**
   * Username validation rules:
   * - Alphanumeric characters (a-z, A-Z, 0-9)
   * - Underscores (_) and dashes (-)
   * - Length: 3-30 characters
   * - No consecutive special characters (no __, --, _-, -_)
   * - Cannot start or end with special character
   */

  if (typeof username !== 'string') {
    return false;
  }

  const length = username.length;
  if (length < 3 || length > 30) {
    return false;
  }

  // Check for valid characters only
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return false;
  }

  // Check for consecutive special characters
  if (/__|--|_-|-_/.test(username)) {
    return false;
  }

  // Cannot start or end with special character
  if (/^[_-]|[_-]$/.test(username)) {
    return false;
  }

  return true;
}
