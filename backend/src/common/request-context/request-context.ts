import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context carried through async calls (issue #1480), so any code
 * - loggers, repositories, outbound HTTP clients - can read the request id
 * without it being passed down as an argument.
 */
export interface RequestContextStore {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/** Accepts UUID-like ids only, so a client cannot inject log lines or SQL comments. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

export function runWithRequestContext<T>(store: RequestContextStore, fn: () => T): T {
  return storage.run(store, fn);
}

export function getRequestContext(): RequestContextStore | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Prefix for log lines: "[<requestId>] " or an empty string outside a request. */
export function requestIdLogPrefix(): string {
  const id = getRequestId();
  return id ? `[${id}] ` : '';
}

/** Appends the request id to a SQL statement as a trailing comment. */
export function withRequestIdComment(sql: string): string {
  const id = getRequestId();
  if (!id || !isSafeRequestId(id)) return sql;
  return `${sql} /* request_id=${id} */`;
}

/**
 * Stores the request id as a transaction-local setting so it shows up in
 * pg_stat_activity / slow-query logs: `current_setting('app.request_id')`.
 * Call it at the start of a transaction.
 */
export async function setLocalRequestId(runner: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  const id = getRequestId();
  if (!id || !isSafeRequestId(id)) return;
  await runner.query("SELECT set_config('app.request_id', $1, true)", [id]);
}
