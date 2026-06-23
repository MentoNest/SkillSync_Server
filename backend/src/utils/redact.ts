export function redact(obj: any, keysToRedact: string[]): any {
  if (!obj) {
    return obj;
  }

  const newObj = { ...obj };

  for (const key of keysToRedact) {
    if (newObj[key]) {
      newObj[key] = '[REDACTED]';
    }
  }

  return newObj;
}