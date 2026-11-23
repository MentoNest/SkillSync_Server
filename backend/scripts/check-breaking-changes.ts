import openapiDiff from 'openapi-diff';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const ROOT = join(__dirname, '..');

/**
 * Compares the spec generated from the current branch against a baseline spec and fails when
 * breaking changes are detected. Designed for PRs: pass `--base <path-to-base-spec>` (e.g. the
 * spec extracted from the target branch). When no baseline is available (first release of the
 * spec) the check is skipped so it never blocks the introducing PR.
 */
async function main(): Promise<void> {
  const headPath = resolve(ROOT, argValue('--head') ?? 'openapi/openapi.json');
  const baseArg = argValue('--base');

  if (!baseArg) {
    console.log('No --base spec supplied; skipping breaking-change detection.');
    return;
  }

  const basePath = resolve(ROOT, baseArg);
  if (!existsSync(basePath)) {
    console.log(`Base spec not found at ${basePath}; skipping (assuming first release of the spec).`);
    return;
  }
  if (!existsSync(headPath)) {
    console.error(`Head spec not found at ${headPath}. Run "npm run openapi:generate" first.`);
    process.exit(1);
  }

  const result = await openapiDiff.diffSpecs({
    sourceSpec: { content: readFileSync(basePath, 'utf8'), location: basePath, format: 'openapi3' },
    destinationSpec: { content: readFileSync(headPath, 'utf8'), location: headPath, format: 'openapi3' },
  });

  const breaking = 'breakingDifferences' in result ? result.breakingDifferences : [];

  if (breaking.length === 0) {
    console.log(
      `No breaking API changes detected (${result.nonBreakingDifferences.length} non-breaking, ` +
        `${result.unclassifiedDifferences.length} unclassified).`,
    );
    return;
  }

  console.error(`\n${breaking.length} breaking API change(s) detected:\n`);
  for (const diff of breaking) {
    console.error(`- [${diff.code}] ${diff.entity}`);
    for (const detail of diff.sourceSpecEntityDetails) {
      console.error(`    removed/changed: ${detail.location}`);
    }
  }
  console.error(
    '\nThis change would break existing clients. If it is intentional, follow the versioning ' +
      'policy in docs/api-versioning.md (bump the version and document the migration).',
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
