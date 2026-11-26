import jestOpenAPI from 'jest-openapi';
import { join } from 'path';

/**
 * Registers the `toSatisfyApiSpec()` / `toSatisfySchemaInApiSpec()` matchers in this test
 * file's context and points them at the committed OpenAPI document.
 *
 * Import this module for its side effects from every `*.contract-spec.ts` file. Each Jest
 * module registry is isolated, so the matchers must be registered per file.
 *
 * `jest-openapi` requires an absolute path (or an already-loaded spec object).
 */
export const OPENAPI_SPEC_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'openapi',
  'openapi.json',
);

jestOpenAPI(OPENAPI_SPEC_PATH);
