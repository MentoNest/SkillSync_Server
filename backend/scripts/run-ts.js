// Launcher for TypeScript maintenance scripts.
//
// ts-node's CLI entry point is unreliable under this project's Node version (it can
// re-spawn and exit silently), so instead we register its compiler hook from a plain
// CommonJS entry point and require the target script directly. Usage:
//
//   node scripts/run-ts.js scripts/<script>.ts [args...]
'use strict';

const { resolve } = require('path');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/run-ts.js <script.ts> [args...]');
  process.exit(1);
}

require('ts-node').register({
  project: resolve(__dirname, '..', 'tsconfig.scripts.json'),
  transpileOnly: true,
});

// Expose the script's own arguments at the expected positions.
process.argv = [process.argv[0], resolve(process.cwd(), target), ...process.argv.slice(3)];

require(resolve(process.cwd(), target));
