import test from 'node:test';
import assert from 'node:assert/strict';
import { median, summarize, passes, withRetry, TEMPLATES, THRESHOLDS } from './lighthouse-templates.mjs';

test('twaalf vaste sjablonen, uniek, incl. indexes en Bourgogne (LAT-12594)', () => {
  assert.equal(TEMPLATES.length, 12);
  assert.equal(new Set(TEMPLATES.map((t) => t.path)).size, 12);
  for (const p of ['/', '/wijnhuizen/', '/wijnroutes/', '/streken/bourgogne/']) {
    assert.ok(TEMPLATES.some((t) => t.path === p), `${p} ontbreekt`);
  }
});

test('passes toetst CLS <= 0,1', () => {
  const s = { performance: 95, lcpMs: 1000, cls: 0.1 };
  assert.ok(passes(s));
  assert.ok(!passes({ ...s, cls: 0.11 }));
});

test('withRetry herkanst een mislukte Chrome-start, en faalt na de laatste poging', () => {
  let n = 0;
  assert.equal(withRetry(() => { if (++n < 3) throw new Error('debugging port'); return 'ok'; }, 3), 'ok');
  assert.throws(() => withRetry(() => { throw new Error('altijd'); }, 2), /altijd/);
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

test('attribution leest LCP-element, fasen en shift-bronnen uit LH13-insights', async () => {
  const { attribution } = await import('./lighthouse-templates.mjs');
  const j = { audits: {
    'lcp-breakdown-insight': { details: { type: 'list', items: [
      { type: 'table', items: [{ subpart: 'timeToFirstByte', duration: 600.4 }, { subpart: 'resourceLoadDuration', duration: 2100 }] },
      { type: 'node', selector: 'main > img.hero', nodeLabel: 'Bourgogne', snippet: '<img class="hero">' },
    ] } },
    'cls-culprits-insight': { details: { type: 'list', items: [{ type: 'table', items: [
      { node: { type: 'node', selector: 'ul.grid', snippet: '<ul class="grid">' }, value: 0.1673, subItems: { items: [{ cause: 'Unsized image element' }] } },
    ] }] } },
  } };
  const r = attribution(j);
  assert.equal(r.lcpElement.selector, 'main > img.hero');
  assert.deepEqual(r.lcpPhases, { timeToFirstByte: 600, resourceLoadDuration: 2100 });
  assert.equal(r.layoutShifts[0].selector, 'ul.grid');
  assert.equal(r.layoutShifts[0].score, 0.1673);
  assert.deepEqual(r.layoutShifts[0].causes, ['Unsized image element']);
});
