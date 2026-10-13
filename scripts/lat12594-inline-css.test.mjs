// LAT-12594: render-blocking stylesheets weg van het kritieke pad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');

test('astro inlinet alle stylesheets', () => {
  assert.match(cfg, /inlineStylesheets:\s*'always'/);
});
