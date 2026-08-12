#!/usr/bin/env node
// scripts/run-all-tests.mjs — LAT-4989
//
// Single entry point for `npm run test:all`. Two jobs:
//
//   1. Guard: every scripts/*.test.* file must be referenced by some
//      "test:*" script in package.json. Without this, a new suite can be
//      added and never wired into CI — which is exactly how 13 of 15
//      suites went unexecuted before LAT-4989.
//   2. Runner: execute every "test:*" script (this one excluded) so a new
//      suite is picked up automatically once it passes the guard.
//
// The guard runs before anything else executes, so a wiring gap fails fast
// instead of hiding behind whichever suites happen to run first.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const testScripts = Object.entries(pkg.scripts ?? {})
  .filter(([name]) => name.startsWith('test:') && name !== 'test:all')
  .sort(([a], [b]) => a.localeCompare(b));

const testFiles = readdirSync(path.join(root, 'scripts'))
  .filter((f) => /\.test\.\w+$/.test(f))
  .sort();

const referenced = new Set();
for (const [, command] of testScripts) {
  for (const match of command.matchAll(/[\w./-]+\.test\.\w+/g)) {
    referenced.add(path.basename(match[0]));
  }
}

const uncovered = testFiles.filter((f) => !referenced.has(f));
if (uncovered.length > 0) {
  console.error(
    `\nGuard failed (LAT-4989): scripts/*.test.* zonder npm "test:*"-script:\n` +
      uncovered.map((f) => `  - scripts/${f}`).join('\n') +
      `\n\nVoeg een "test:<naam>" script toe in package.json dat dit bestand draait,\n` +
      `zodat "npm run test:all" hem meeneemt.\n`,
  );
  process.exit(1);
}

console.log(
  `Guard ok: ${testFiles.length} testbestand(en) gedekt door ${testScripts.length} "test:*"-script(s).`,
);

const failed = [];
for (const [name] of testScripts) {
  console.log(`\n▶ npm run ${name}`);
  try {
    execFileSync('npm', ['run', '--silent', name], { stdio: 'inherit', cwd: root });
  } catch {
    failed.push(name);
  }
}

console.log(`\n${testScripts.length - failed.length}/${testScripts.length} "test:*"-scripts groen.`);
if (failed.length > 0) {
  console.error(`Gefaald: ${failed.join(', ')}`);
  process.exit(1);
}
