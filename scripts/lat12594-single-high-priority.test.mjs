// LAT-12594: per pagina maar één beeld op fetchpriority=high (het LCP-element).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('route-body: eerste body-foto is eager maar niet fetchpriority=high', () => {
  const src = readFileSync(new URL('../src/lib/route-body.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetchpriority="high"/);
  assert.match(src, /loading="eager" decoding="async"/);
});

test('wijnroutes-hub: alleen de eerste kaart krijgt fetchpriority=high', () => {
  const src = readFileSync(new URL('../src/components/WijnroutesHub.astro', import.meta.url), 'utf8');
  assert.match(src, /fetchpriority=\{i === 0 \? 'high' : undefined\}/);
  assert.doesNotMatch(src, /fetchpriority=\{eager \? 'high'/);
});
