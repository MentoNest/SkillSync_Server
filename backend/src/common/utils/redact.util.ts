const REDACTED = '[REDACTED]';

const SENSITIVE_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'apikey',
  'accesskey',
  'privatekey',
  'credential',
  'session',
  'cookie',
  'otp',
];

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'pin' || SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function walk(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 20) return '[Truncated]';
  if (seen.has(value)) return '[Circular]';
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return REDACTED;

  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => walk(entry, seen, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : walk(entry, seen, depth + 1);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function redactSensitiveData<T>(value: T): T {
  return walk(value, new WeakSet<object>(), 0) as T;
}
