import type { paths } from './schema';

export type { components, operations, paths } from './schema';

export interface ApiClientOptions {
  /** Base URL of the SkillSync API, e.g. `https://api.skillsync.dev`. */
  baseUrl: string;
  /** Returns the current access token, if the user is signed in. */
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  /** Override the fetch implementation (defaults to the global `fetch`). */
  fetch?: typeof fetch;
}

export type ApiRequest = <T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: keyof paths & string,
  body?: unknown,
) => Promise<T>;

/**
 * Minimal, dependency-free typed fetch wrapper around the generated OpenAPI types.
 * The `path` argument is constrained to the endpoints published in the spec, so a
 * backend contract change surfaces as a TypeScript error at build time.
 */
export function createApiClient(options: ApiClientOptions): ApiRequest {
  const doFetch = options.fetch ?? globalThis.fetch;

  return async function request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: keyof paths & string,
    body?: unknown,
  ): Promise<T> {
    const token = await options.getAccessToken?.();

    const response = await doFetch(options.baseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API ${method} ${path} failed (${response.status}): ${detail}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };
}
