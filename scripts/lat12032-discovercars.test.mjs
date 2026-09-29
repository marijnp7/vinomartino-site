/** LAT-12032 — DiscoverCars: fail-closed op geverifieerde slugs, a_aid + chan aanwezig. */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const workDir = mkdtempSync(join(tmpdir(), 'lat12032-dc-'));
const outfile = join(workDir, 'cta.mjs');
await build({ entryPoints: ['src/lib/cta-blocks.ts'], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { resolveCtaHref, ctaLinkAvailable, ctaTrackPartner } = await import(outfile);

test('geverifieerde slug → a_aid + chan', () => {
  const link = { partner: 'discovercars', dest: 'south-africa/cape-town' };
  assert.equal(ctaLinkAvailable(link), true);
  assert.equal(
    resolveCtaHref(link, 'cta-primary-kaap'),
    'https://www.discovercars.com/south-africa/cape-town?a_aid=vinomartino&chan=cta-primary-kaap',
  );
  assert.equal(ctaTrackPartner(link), 'discovercars');
});

test('fail-closed: onbekende of geraden slug geeft geen link', () => {
  for (const dest of [undefined, '', 'italy/florence', 'italy-mainland/siena', 'https://evil.example/x']) {
    const link = { partner: 'discovercars', dest };
    assert.equal(ctaLinkAvailable(link), false, String(dest));
    assert.equal(resolveCtaHref(link, 'x'), '');
  }
});

const runDom = (hrefs) => {
  const d = mkdtempSync(join(workDir, 'dom-'));
  mkdirSync(join(d, 'a'));
  const links = hrefs.map((h) => `<a href="${h}" rel="sponsored">x</a>`).join('');
  writeFileSync(join(d, 'a', 'index.html'), `<html><body>${links}<a href="/affiliate-verklaring/">v</a></body></html>`);
  return spawnSync('node', ['scripts/check-dom-affiliate.mjs', d, '--lenient'], { encoding: 'utf8' });
};

test('DOM-check: alleen a_aid=vinomartino + chan is groen, kaal is een lek', () => {
  assert.equal(runDom(['https://www.discovercars.com/south-africa/cape-town?a_aid=vinomartino&amp;chan=x']).status, 0);
  assert.equal(runDom(['https://www.discovercars.com/south-africa/cape-town']).status, 1);
  assert.equal(runDom(['https://www.discovercars.com/?a_aid=vinomartino']).status, 1);
});
