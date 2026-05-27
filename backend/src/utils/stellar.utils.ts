/**
 * Retrieves a value from the in-memory cache by key.
 *
 * @param cache - The cache map to read from.
 * @param key - The cache key to look up.
 * @returns The cached value, or `undefined` if the key is not present.
 */
export function getCache<T>(cache: Map<string, T>, key: string): T | undefined {
  return cache.get(key);
}

/**
 * Builds a namespaced cache key from a prefix and identifier.
 *
 * @param prefix - A string namespace for the key (e.g. `'fee'`, `'ledger'`).
 * @param id - A unique identifier to append to the prefix.
 * @returns The composed cache key string.
 */
export function buildCacheKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

/**
 * Retries an async operation up to a specified number of attempts.
 *
 * @param fn - The async function to execute and retry on failure.
 * @param retries - Maximum number of retry attempts (default: 3).
 * @returns A promise resolving to the result of `fn`.
 * @throws {Error} Re-throws the last error if all attempts are exhausted.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Normalises a raw RPC or Horizon error into a plain message string.
 *
 * @param error - The raw error thrown by the Stellar SDK or HTTP client.
 * @returns A human-readable error message safe to surface to callers.
 */
export function sanitizeRpcError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown RPC error occurred';
}
