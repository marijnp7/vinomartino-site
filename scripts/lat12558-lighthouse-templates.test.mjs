import test from 'node:test';
import assert from 'node:assert/strict';
import { median, summarize, passes, TEMPLATES, THRESHOLDS } from './lighthouse-templates.mjs';

test('zes vaste sjablonen, uniek', () => {
  assert.equal(TEMPLATES.length, 6);
  assert.equal(new Set(TEMPLATES.map((t) => t.path)).size, 6);
});

test('median even en oneven', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test('summarize neemt mediaan per sjabloon en passes toetst beide drempels', () => {
  const run = (performance, lcpMs) => ({ performance, lcpMs, fcpMs: 1000, tbtMs: 100, cls: 0 });
  const [a, b, c] = summarize([
    { template: 'a', url: 'u', runs: [run(90, 2000), run(40, 9000), run(88, 2100)] },
    { template: 'b', url: 'u', runs: [run(90, 3000)] },
    { template: 'c', url: 'u', runs: [run(80, 1000)] },
  ]);
  assert.equal(a.performance, 88);
  assert.equal(a.lcpMs, 2100);
  assert.ok(passes(a));
  assert.ok(!passes(b), 'LCP boven 2,5 s faalt');
  assert.ok(!passes(c), 'performance onder 85 faalt');
  assert.equal(THRESHOLDS.performance, 85);
});
