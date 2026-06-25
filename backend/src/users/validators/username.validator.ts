export function isValidUsername(username: string): boolean {
  if (!username || username.length < 3 || username.length > 30) {
    return false;
  }

  return /^[a-zA-Z0-9_]+$/.test(username) && !/_{2,}/.test(username) && !/^_/.test(username) && !/_$/.test(username);
}
