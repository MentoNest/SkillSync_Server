/**
 * Fails when the head OpenAPI document breaks compatibility with the base one.
 *
 *   npm run openapi:check -- <base.json> <head.json>
 */
import { readFileSync } from 'fs';
import { findBreakingChanges } from '../src/common/openapi/openapi-diff';

const [basePath, headPath] = process.argv.slice(2);
if (!basePath || !headPath) {
  console.error('Usage: check-openapi-breaking <base.json> <head.json>');
  process.exit(2);
}

const base = JSON.parse(readFileSync(basePath, 'utf8'));
const head = JSON.parse(readFileSync(headPath, 'utf8'));
const problems = findBreakingChanges(base, head);

if (problems.length > 0) {
  console.error('Breaking API changes detected:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Bump the API version (see docs/API_CONTRACT_TESTING.md) instead of breaking /v1.');
  process.exit(1);
}
console.log('No breaking API changes.');
