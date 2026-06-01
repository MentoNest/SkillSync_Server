import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request Context for storing and accessing request-scoped data
 * Uses AsyncLocalStorage to ensure data is not shared between concurrent requests
 */
export interface RequestContext {
  requestId: string;
}

/**
 * AsyncLocalStorage for request context
 * Maintains separate context for each async operation/request
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 * @returns RequestContext or undefined if not in request scope
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current request ID
 * @returns requestId string or undefined if not in request scope
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * Set the request context for the current async execution
 * @param context RequestContext with requestId
 * @param callback Function to execute within the context
 * @returns Result of callback
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

/**
 * Run an async function within a request context
 * @param context RequestContext with requestId
 * @param callback Async function to execute within the context
 * @returns Promise result of callback
 */
export async function runWithRequestContextAsync<T>(
  context: RequestContext,
  callback: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    requestContextStorage.run(context, async () => {
      try {
        const result = await callback();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}
