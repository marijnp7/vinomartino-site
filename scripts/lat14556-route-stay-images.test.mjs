// LAT-14556: vangnet-unit voor scripts/check-route-stay-images.mjs (dist-scan in deploy.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanHtml } from './check-route-stay-images.mjs';

const img = `<div class="poi-card__media"><img src="/images/accommodaties/x.jpg" alt="Hotel Barolo" class="poi-card__img"></div>`;
const ph = `<div class="poi-card__media poi-card__media--empty"><div class="smart-img-placeholder poi-card__img" role="img"></div></div>`;
const kaart = (key, inner, extra = '') => `<article class="poi-card" id="slaap-${key}" data-route-stay="${key}"${extra}>${inner}<div class="poi-card__body"><h4 class="poi-card__name">${key}</h4></div></article>`;
const ref = (key) => `<article class="poi-card poi-card--ref" data-route-stay="${key}" data-route-stay-ref><p class="poi-card__ref">${key} <a href="#slaap-${key}">Zelfde adres als nacht 1</a></p></article>`;
const kinds = (html) => scanHtml(html).findings.map((f) => `${f.kind}:${f.key}`);

test('record met beeld, placeholder zonder record en verwijzing zijn groen', () => {
  const html = kaart('hotel barolo', img, ' data-acc-record') + kaart('palazzo finati', ph) + ref('palazzo finati');
  assert.deepEqual(kinds(html), []);
  assert.equal(scanHtml(html).kaarten, 3);
});

test('ROOD: gekoppeld accommodatie-record zonder beeld (live 22-10)', () => {
  assert.deepEqual(kinds(kaart('hotel barolo', ph, ' data-acc-record')), ['record-zonder-beeld:hotel barolo']);
  assert.deepEqual(kinds(kaart('hotel barolo', '', ' data-acc-record')), ['record-zonder-beeld:hotel barolo']);
});

test('ROOD: volle kaart zonder media (lege ruimte)', () => {
  assert.deepEqual(kinds(kaart('locanda del pilone', '')), ['geen-media:locanda del pilone']);
});

test('ROOD: hetzelfde adres twee keer als volle kaart (Palazzo Finati 3x)', () => {
  assert.deepEqual(kinds(kaart('palazzo finati', ph) + kaart('palazzo finati', ph)), ['dubbele-kaart:palazzo finati']);
});

test('andere poi-cards (wijnhuizen) tellen niet mee', () => {
  assert.equal(scanHtml(`<article class="poi-card"><h4>Vietti</h4></article>`).kaarten, 0);
});

test('CLI: rood op fout, groen op goed (NL en EN), rood op lege dist', () => {
  const run = (dir) => { try { execFileSync(process.execPath, ['scripts/check-route-stay-images.mjs', dir], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  const base = mkdtempSync(join(tmpdir(), `lat14556-${process.pid}-`));
  const fout = join(base, 'fout', 'wijnroutes', 'langhe-piemonte');
  const goed = join(base, 'goed', 'en', 'wijnroutes', 'langhe-piemonte');
  mkdirSync(fout, { recursive: true }); mkdirSync(goed, { recursive: true }); mkdirSync(join(base, 'leeg'));
  writeFileSync(join(fout, 'index.html'), kaart('hotel barolo', ph, ' data-acc-record'));
  writeFileSync(join(goed, 'index.html'), kaart('hotel barolo', img, ' data-acc-record') + ref('hotel barolo'));
  assert.equal(run(join(base, 'fout')), 1);
  assert.equal(run(join(base, 'goed')), 0);
  assert.equal(run(join(base, 'leeg')), 1);
});
