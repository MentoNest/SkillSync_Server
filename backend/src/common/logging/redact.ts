export const REDACTED = '[REDACTED]';

/** Header and field names whose values must never reach the logs. */
const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|password|passwd|pwd|secret|client[-_]?secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|signature|private[-_]?key|seed|mnemonic)$/i;

/** Values that look like credentials even under an innocent key. */
const SENSITIVE_VALUE: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED], // JWTs
  [/\bS[A-Z2-7]{55}\b/g, REDACTED], // Stellar secret keys
];

const MAX_DEPTH = 6;

export function redactString(value: string): string {
  return SENSITIVE_VALUE.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

/** Copy of `value` with sensitive keys and credential-looking strings replaced. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return out;
}

/** Redacts request headers (always applied before headers are logged). */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  return redact(headers) as Record<string, unknown>;
}

/** Removes secret-looking query parameters from a URL path. */
export function redactUrl(url: string): string {
  const [path, query] = url.split('?', 2);
  if (!query) return path;
  const cleaned = query
    .split('&')
    .map((pair) => {
      const [name, ...rest] = pair.split('=');
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // Keep the raw name when it is not valid percent-encoding.
      }
      return SENSITIVE_KEY.test(decoded) ? `${name}=${REDACTED}` : [name, ...rest].join('=');
    })
    .join('&');
  return `${path}?${cleaned}`;
}
