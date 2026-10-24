// LAT-14551: tierlabels altijd met icoon, nooit dubbel in een tiergroep.
// Vangnet-unit voor scripts/check-stay-tier-labels.mjs; de dist-scan zelf draait
// als blokkerende stap na `npm run build` in .github/workflows/deploy.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanHtml } from './check-stay-tier-labels.mjs';

const icon = (t) => `<svg class="stay-tier-icon" data-stay-tier="${t}" aria-hidden="true"><path d="M0 0"/></svg>`;
const label = (t, name, v = 'badge') => `<span class="stay-tier-label stay-tier-label--${v}" data-stay-tier="${t}">${icon(t)}${name}</span>`;
const kinds = (html) => scanHtml(html).map((f) => `${f.kind}:${f.label}`);

test('StayTierLabel (badge en inline) NL en EN is groen', () => {
  assert.deepEqual(kinds(`<article class="poi-card"><div>${label('slim_geboekt', 'Slim geboekt')}</div></article>`), []);
  assert.deepEqual(kinds(`<p>Alba · ${label('pure_luxe', 'Pure luxury', 'inline')}</p>`), []);
  assert.deepEqual(kinds(`<button aria-pressed="false">${label('prijs_kwaliteit', 'Great value', 'inline')}</button>`), []);
});

test('roundup-groepskop met icoon is groen, kaart zonder badge ook', () => {
  const html = `<section class="acc-roundup__category"><header class="acc-roundup__category-head"><h3>${icon('pure_luxe')}Pure luxe</h3><p>Uitleg</p></header><div class="acc-roundup__grid"><article class="acc-kaart"><h4>Relais San Maurizio</h4></article></div></section>`;
  assert.deepEqual(kinds(html), []);
  assert.deepEqual(kinds(`<span class="acc-roundup__category-name">${icon('slim_geboekt')}Slim geboekt</span>`), []);
});

test('ROOD: tekstbadge zonder icoon (poi-card__badge, build 1580)', () => {
  const html = `<div class="poi-card__head"><h4><a href="/x/">Hotel Barolo</a></h4> <span class="poi-card__badge" style="color:#5C6B3F">Slim geboekt</span></div>`;
  assert.deepEqual(kinds(html), ['los-label:Slim geboekt']);
  assert.deepEqual(kinds(`<span class="poi-card__badge">Value for money</span>`), ['los-label:Value for money']);
});

test('verborgen <select hidden aria-hidden> achter de segmented control is groen (build 1581)', () => {
  const html = `<div class="acc-klasse__seg"><button aria-pressed="false">${label('pure_luxe', 'Pure luxe', 'inline')} (3)</button></div><select id="acc-klasse" name="klasse" data-kh-select hidden aria-hidden="true" tabindex="-1"><option value="pure_luxe" data-label="Pure luxe">Pure luxe (3)</option></select>`;
  assert.deepEqual(kinds(html), []);
});

test('ROOD: alleen hidden of alleen aria-hidden is niet genoeg', () => {
  const opt = `<option value="pure_luxe">Pure luxe (3)</option>`;
  assert.deepEqual(kinds(`<select hidden>${opt}</select>`), ['los-label:Pure luxe']);
  assert.deepEqual(kinds(`<select aria-hidden="true">${opt}</select>`), ['los-label:Pure luxe']);
});

test('ROOD: tierfilter als native <option> (kan geen icoon tonen)', () => {
  const html = `<select><option value="">Alle klassen</option><option value="pure_luxe" data-label="Pure luxe">Pure luxe (3)</option></select>`;
  assert.deepEqual(kinds(html), ['los-label:Pure luxe']);
});

test('ROOD: badge op een kaart binnen een tiergroep (dubbel label, LAT-14496)', () => {
  const head = `<header class="acc-roundup__category-head"><h3>${icon('pure_luxe')}Pure luxe</h3></header>`;
  const metIcoon = `<section class="acc-roundup__category">${head}<article>${label('pure_luxe', 'Pure luxe')}</article></section>`;
  assert.deepEqual(kinds(metIcoon), ['dubbel-label:stay-tier-label', 'dubbel-label:Pure luxe']);
  const tekst = `<div data-stay-tier-group="pure_luxe">${head}<article><span class="badge">Pure luxe</span></article></div>`;
  assert.deepEqual(kinds(tekst), ['dubbel-label:Pure luxe']);
});

test('lopende tekst, nadruk in CMS-tekst, title en script zijn geen label', () => {
  assert.deepEqual(kinds(`<p>Wie Pure luxe zoekt, slaapt in Barolo.</p>`), []);
  assert.deepEqual(kinds(`<p><strong>Slim geboekt</strong>: agriturismi tussen de wijngaarden.</p>`), []);
  assert.deepEqual(kinds(`<head><title>Pure luxe</title><script>const l = "<span>Pure luxe</span>";</script></head>`), []);
});

test('CLI: rood op fout voorbeeld, groen op goed voorbeeld, rood op lege dist', () => {
  const run = (dir) => {
    try { execFileSync(process.execPath, ['scripts/check-stay-tier-labels.mjs', dir], { stdio: 'pipe' }); return 0; }
    catch (e) { return e.status; }
  };
  const base = mkdtempSync(join(tmpdir(), `lat14551-${process.pid}-`));
  const fout = join(base, 'fout', 'streken', 'langhe-piemonte');
  const goed = join(base, 'goed', 'en', 'streken', 'langhe-piemonte');
  mkdirSync(fout, { recursive: true });
  mkdirSync(goed, { recursive: true });
  mkdirSync(join(base, 'leeg'));
  writeFileSync(join(fout, 'index.html'), `<span class="poi-card__badge">Pure luxe</span>`);
  writeFileSync(join(goed, 'index.html'), `<article>${label('pure_luxe', 'Pure luxury')}</article>`);
  assert.equal(run(join(base, 'fout')), 1);
  assert.equal(run(join(base, 'goed')), 0);
  assert.equal(run(join(base, 'leeg')), 1);
});

test('gate is geregistreerd: package.json én deploy-build na astro build', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts['test:lat14551-stay-tier-labels'] ?? '', /lat14551-stay-tier-labels\.test\.mjs/);
  const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(deploy, /npm run build && [^\n]*node scripts\/check-stay-tier-labels\.mjs/);
});

test('tussenkop in artikelbody en inhoudsopgave zijn geen label (LAT-14830)', () => {
  const toc = `<nav class="toc"><ol class="toc-list"><li class="toc-item"><a href="#pure-luxe">Pure luxe</a></li><li><a href="#value-for-money">Value for money</a></li></ol></nav>`;
  const body = `<div class="article-prose"><h2 id="slim-geboekt">Slim geboekt</h2><p>Twee adressen.</p><h2 id="pure-luxury">Pure luxury</h2></div>`;
  assert.deepEqual(kinds(toc + body), []);
});

test('ROOD: losse badge buiten proza blijft rood naast een proza-kop (LAT-14830)', () => {
  const html = `<div class="article-prose"><h2>Pure luxe</h2></div><span class="poi-card__badge">Pure luxe</span>`;
  assert.deepEqual(kinds(html), ['los-label:Pure luxe']);
});
