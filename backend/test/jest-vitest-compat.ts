/**
 * Jest -> Vitest compatibility shim.
 *
 * The unit suites under `src` were written against Jest (`jest.fn()`,
 * `jest.mock()`, and friends), but this package runs its tests with Vitest.
 * Vitest exposes an equivalent global under the name `vi`, and its mock API is
 * the same object model Jest's is (`mockReturnThis()`, `mockResolvedValue()`,
 * `mockReturnValue()`, ...), so aliasing the global is enough to run the
 * existing suites unmodified.
 *
 * `vi.mock` is hoisted and rewritten by Vitest's transform at module scope, so
 * `jest.mock` calls inside suites continue to be handled correctly - they are
 * compiled to `vi.mock` before this shim is even consulted.
 */
import { vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var jest: typeof vi;
}

globalThis.jest = vi;

export {};
