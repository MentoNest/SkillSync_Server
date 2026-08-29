/**
 * Shared sensitive-data redaction used by both the global request logging
 * middleware (#1143) and the global exception filter (#1144), so logs and
 * error responses never leak passwords, tokens, or auth headers.
 */
const SENSITIVE_KEY_PATTERN =
  /pass(word)?|token|secret|authoriz(e|ation)|api[-_]?key|cookie|ssn|credit[-_]?card|cvv|pin/i;

/**
 * Recursively walks an object/array and replaces the value of any key whose
 * name looks sensitive (password, token, authorization, cookie, ...) with
 * `[REDACTED]`. Primitives and non-matching keys are returned unchanged.
 */
export function redactSensitiveData<T>(
  input: T,
  seen: WeakSet<object> = new WeakSet(),
): T {
  return redactValue(input, seen) as T;
}

function redactValue(input: unknown, seen: WeakSet<object>): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactValue(item, seen));
  }

  if (typeof input === 'object') {
    const obj = input;
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        result[key] = redactValue(value, seen);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return input;
}
