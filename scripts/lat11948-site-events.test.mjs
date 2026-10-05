// LAT-11948 — Plausible is eruit; eigen cookieloze meting naar site_events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('src bevat geen plausible meer (script, attribuut of import)', () => {
  const hits = walk(path.join(root, 'src'))
    .filter((f) => /\.(astro|ts|tsx|js|mjs)$/.test(f))
    .filter((f) => /plausible/i.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f));
  assert.deepEqual(hits.filter((f) => f !== 'src/lib/site-events.ts'), []);
});

test('SiteLayout laadt site-events en geen extern analytics-script', () => {
  const s = readFileSync(path.join(root, 'src/layouts/SiteLayout.astro'), 'utf8');
  assert.match(s, /initSiteEvents\(\)/);
  assert.doesNotMatch(s, /plausible\.io/);
});

test('site-events dekt de vijf eventtypes, DNT en dagelijkse salt', () => {
  const s = readFileSync(path.join(root, 'src/lib/site-events.ts'), 'utf8');
  for (const e of ['pageview', 'cta_click', 'newsletter_signup', 'affiliate_in_view', 'web_vital']) {
    assert.ok(s.includes(`'${e}'`), `event ${e} ontbreekt`);
  }
  for (const m of ['LCP', 'INP', 'CLS']) assert.ok(s.includes(`'${m}'`), `metric ${m} ontbreekt`);
  assert.match(s, /globalPrivacyControl/);
  assert.match(s, /todayUtc\(\)/);
  assert.doesNotMatch(s, /document\.cookie/);
});

test('nginx proxied /api/events zonder client-IP door te geven', () => {
  const s = readFileSync(path.join(root, 'nginx-prod.conf'), 'utf8');
  const i = s.indexOf('location = /api/events');
  assert.notEqual(i, -1);
  const block = s.slice(i, s.indexOf('\n    }', i));
  assert.match(block, /items\/site_events/);
  assert.match(block, /X-Forwarded-For ""/);
  assert.match(block, /X-Real-IP ""/);
});

test('LAT-12573: elke rij draagt device_class en conn_type, en Directus staat ze toe', () => {
  const ts = readFileSync(path.join(root, 'src/lib/site-events.ts'), 'utf8');
  assert.match(ts, /device_class: deviceClass\(window\.innerWidth\)/);
  assert.match(ts, /conn_type: connectionType\(\)/);
  const dx = readFileSync(path.join(root, 'directus/scripts/create-site-events-collection.mjs'), 'utf8');
  const perm = dx.slice(dx.indexOf('await ensure(pub, "create"'));
  assert.match(perm, /"device_class", "conn_type"/);
  assert.match(dx, /s\("device_class"/);
  assert.match(dx, /s\("conn_type"/);
});
