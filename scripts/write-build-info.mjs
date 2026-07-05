#!/usr/bin/env node
// LAT-1767 — single-source build-info.json (part of `npm run build`).
//
// Schrijft dist/build-info.json zodat verify-build.sh en de prod smoke-test
// (sha-match, LAT-910) lokaal én in CI dezelfde gate zien. In CI levert de
// workflow GIT_SHA/RUN_ID/RUN_NUMBER via env (de gersyncte staging-dir heeft
// geen .git); lokaal valt het terug op `git rev-parse HEAD`.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const info = {
  sha: process.env.GIT_SHA || gitSha(),
  runId: process.env.RUN_ID || 'local',
  runNumber: process.env.RUN_NUMBER || '0',
  builtAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
};

if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
writeFileSync('dist/build-info.json', JSON.stringify(info) + '\n');
console.log('build-info.json:', JSON.stringify(info));
