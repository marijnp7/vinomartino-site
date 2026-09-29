import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('./check-dom-affiliate.mjs', import.meta.url).pathname;
const page = (links) => `<html><body>${links.map((h) => `<a href="${h}" rel="sponsored">x</a>`).join('')}<a href="/affiliate-verklaring/">v</a></body></html>`;
const run = (html) => {
  const d = mkdtempSync(join(tmpdir(), 'lat11947-'));
  mkdirSync(join(d, 'a'));
  writeFileSync(join(d, 'a', 'index.html'), html);
  return spawnSync('node', [script, d, '--lenient'], { encoding: 'utf8' });
};

test('groen: alle partners via trackingdomein', () => {
  const r = run(page([
    'https://www.kqzyfj.com/click-1-2?url=https%3A%2F%2Fwww.booking.com%2F&sid=a',
    'https://tc.tradetracker.net/?c=1&a=2&r=n14-x&u=https%3A%2F%2Fwww.sunnycars.nl%2F',
    'https://www.getyourguide.com/?partner_id=CRMZDZ6&cmp=x',
    'https://www.stay22.com/allez/roam?aid=vm&address=x',
  ]));
  assert.equal(r.status, 0, r.stdout);
});

test('rood: kale Sunny Cars en kale Booking zijn lekken', () => {
  const r = run(page(['https://www.sunnycars.nl/auto-huren/sardinie/', 'https://www.booking.com/searchresults.html?ss=x']));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /"leaks": 2/);
});

test('rood: affiliate-links zonder disclosure', () => {
  const r = run('<a href="https://www.kqzyfj.com/click-1-2?url=x" rel="sponsored">x</a>');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /disclosure ontbreekt/);
});

test('Sunny Cars-CTA is fail-closed op de TradeTracker-ids in alle drie de CTA-componenten', async () => {
  const { readFileSync } = await import('node:fs');
  const root = new URL('../src/', import.meta.url);
  const lib = readFileSync(new URL('lib/cta-blocks.ts', root), 'utf8');
  assert.match(lib, /export function ctaLinkAvailable/);
  assert.match(lib, /link\.partner !== 'sunny-cars' \|\| sunnyCarsIds\(\) !== null/);
  for (const c of ['CtaPrimary', 'CtaComparison', 'CtaClosing']) {
    assert.match(readFileSync(new URL(`components/${c}.astro`, root), 'utf8'), /ctaLinkAvailable\(/, c);
  }
});

test('markdown-renderer wrapt kale booking.com-links via CJ met eigen subID', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/lib/markdown.ts', import.meta.url), 'utf8');
  assert.match(src, /wrapBookingHastLinks\(rawHast as HastParent/);
  assert.match(src, /buildCjBookingLink\(href, 'n14-body', locale\)/);
});
