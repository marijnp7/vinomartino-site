// LAT-12560 (zet 5, taak 5.3) — nieuwsbrief-CTA op clusterpagina's, eerlijke frequentiebelofte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitAfterFirstSection } from '../src/lib/newsletter-inline.ts';

// LET OP (LAT-12572): deze test leest alleen src/lib/ui-strings.ts. Voor EN overlayt fetchUiStrings()
// de Directus-rijen (ui_strings_translations, languages_code=en) OVER UI_STRING_EN heen, dus de EN-waarheid
// op productie staat in Directus en wordt hier NIET gedekt. Een groene run zegt niets over de EN-site.
// Controle daar: directus/scripts/lat12572-en-frequency-fix.mjs (--dry-run) moet "changed=0" en
// "stale-na" zonder nieuwsbrief-keys melden.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

test('split valt vlak voor de tweede h2', () => {
  const html = '<p>intro</p><h2 id="a">A</h2><p>a</p><h2 id="b">B</h2><p>b</p>';
  const { head, tail, found } = splitAfterFirstSection(html);
  assert.equal(found, true);
  assert.equal(head, '<p>intro</p><h2 id="a">A</h2><p>a</p>');
  assert.equal(tail, '<h2 id="b">B</h2><p>b</p>');
  assert.equal(head + tail, html);
});

test('zonder tweede h2 is er geen eerste sectie: found=false, alles in head (geen alinea-terugval)', () => {
  for (const html of ['', '<p>een</p><p>twee</p><p>drie</p>', '<p>x</p><h2 id="a">A</h2><p>a</p><p>b</p><p>c</p>']) {
    assert.deepEqual(splitAfterFirstSection(html), { head: html, tail: '', found: false });
  }
});

test('artikel- en streeksjabloon dragen de CTA alleen na een echte eerste sectie, de footer aan het eind', () => {
  for (const f of ['src/components/ArtikelDetail.astro', 'src/components/StreekDetail.astro']) {
    const src = read(f);
    assert.match(src, /<NewsletterInline\b/, `${f}: NewsletterInline ontbreekt`);
    assert.match(src, /<NewsletterFooter\b/, `${f}: NewsletterFooter ontbreekt`);
    assert.ok(src.indexOf('<NewsletterInline') < src.indexOf('<NewsletterFooter'), `${f}: volgorde`);
  }
  const artikel = read('src/components/ArtikelDetail.astro');
  assert.match(artikel, /\{showInlineCta && <NewsletterInline/);
  assert.match(artikel, /showInlineCta = bodyFirst\.found && article\.slug !== 'langhe-piemonte-4-dagen-route'/);
  const streek = read('src/components/StreekDetail.astro');
  assert.match(streek, /\{streekBody\.found && <NewsletterInline/);
  assert.match(streek, /\{entry\.bodyHtml && \(\s*<section class="streek-body"/, 'streek-body-sectie hoort bij een body');
});

test('inline en footer hebben elk een eigen cta_id', () => {
  assert.match(read('src/components/NewsletterInline.astro'), /ctaId="newsletter_inline"/);
  assert.match(read('src/components/NewsletterFooter.astro'), /ctaId="footer_signup"/);
});

const NL_KEYS = /^\s*'((?:newsletter|home\.brief|langhe\.capture|debrief)\.[^']+)':\s*(['"`])((?:\\.|(?!\2).)*)\2/gm;
function copy() {
  const src = read('src/lib/ui-strings.ts');
  const en = src.indexOf('export const UI_STRING_EN');
  const out = { nl: {}, en: {} };
  for (const m of src.matchAll(NL_KEYS)) out[m.index < en ? 'nl' : 'en'][m[1]] = m[3];
  return out;
}

test('NL en EN hebben dezelfde nieuwsbriefsleutels (EN viel terug op NL)', () => {
  const { nl, en } = copy();
  for (const k of Object.keys(nl).filter((k) => k.startsWith('newsletter.'))) {
    assert.ok(k in en, `EN mist ${k}`);
  }
});

test('frequentiebelofte is overal ongeveer eens per maand (LAT-13487), zonder gedachtestreepjes', () => {
  const { nl, en } = copy();
  const pages = ['src/pages/de-brief/index.astro', 'src/pages/en/de-brief/index.astro', 'src/components/DeBriefPage.astro'].map(read);
  const all = [...Object.values(nl), ...Object.values(en), ...pages].join('\n');
  assert.doesNotMatch(all, /twee weken|two weeks|paar keer per jaar|few times a year/i);
  for (const [k, v] of [...Object.entries(nl), ...Object.entries(en)]) {
    assert.doesNotMatch(v, /[—–]/, `gedachtestreepje in ${k}`);
  }
  for (const p of pages) assert.doesNotMatch(p, /—/, 'gedachtestreepje op de-brief-pagina');
  assert.match(nl['newsletter.inline.body'], /^Ongeveer eens per maand/);
  assert.match(en['newsletter.inline.body'], /^Roughly once a month/);
  assert.match(nl['newsletter.footer.lede'], /^Ongeveer eens per maand/);
  assert.match(en['newsletter.footer.lede'], /^Roughly once a month/);
});

test('inline-copy is Marijns eigen stem (ik) en verschilt van de footer-lede', () => {
  const { nl, en } = copy();
  assert.match(nl['newsletter.inline.body'], /\bik\b/);
  assert.match(en['newsletter.inline.body'], /\bI write\b/);
  assert.doesNotMatch(nl['newsletter.inline.body'], /Marijn/);
  assert.doesNotMatch(en['newsletter.inline.body'], /Marijn/);
  assert.notEqual(nl['newsletter.inline.body'].split('.')[0], nl['newsletter.footer.lede'].split('.')[0]);
  assert.doesNotMatch(nl['newsletter.inline.body'], /wijnmaker die we net bezochten/);
});

test('/de-brief belooft geen eerste editie meer en de EN-pagina noemt de taal (LAT-13196)', () => {
  const { nl, en } = copy();
  const nlAll = Object.entries(nl).filter(([k]) => k.startsWith('debrief.')).map(([, v]) => v).join('\n');
  const enAll = Object.entries(en).filter(([k]) => k.startsWith('debrief.')).map(([, v]) => v).join('\n');
  assert.doesNotMatch(nlAll, /eerste editie verschijnt|5 november/i);
  assert.doesNotMatch(enAll, /first edition arrives|5 November/i);
  assert.match(en['debrief.lede'], /written in Dutch: there is no English edition/);
  assert.match(nl['debrief.kicker'], /eens per maand/);
  assert.match(en['debrief.kicker'], /once a month/);
});

test('geen voorbeeldbrief die zich als echte editie 1 voordoet', () => {
  const { nl, en } = copy();
  for (const v of [...Object.values(nl), ...Object.values(en)]) assert.doesNotMatch(v, /editie 1\b|edition 1\b/i);
});

test('/de-brief copy en editielijst komen uit ui_strings, niet uit de template (LAT-13354, HARDE REGEL 3)', () => {
  const { nl, en } = copy();
  const keys = Object.keys(nl).filter((k) => k.startsWith('debrief.'));
  assert.ok(keys.length >= 20, `te weinig debrief-keys: ${keys.length}`);
  for (const k of keys) assert.ok(k in en, `EN mist ${k}`);
  for (const k of Object.keys(en).filter((k) => k.startsWith('debrief.'))) assert.ok(k in nl, `NL mist ${k}`);
  for (const n of [1, 2]) {
    assert.match(nl[`debrief.editie.${n}.url`], /^https:\/\/vinomartino\.substack\.com\/p\//);
    assert.equal(nl[`debrief.editie.${n}.url`], en[`debrief.editie.${n}.url`]);
  }
  for (const f of ['src/pages/de-brief/index.astro', 'src/pages/en/de-brief/index.astro']) {
    assert.match(read(f), /<DeBriefPage locale="(nl|en)" \/>/, `${f}: rendert niet via DeBriefPage`);
  }
  const page = read('src/components/DeBriefPage.astro');
  assert.match(page, /loadUiStrings\(locale\)/);
  assert.match(page, /debrief\.editie\.\$\{i\}\.url/, 'editielijst moet uit genummerde ui_strings komen');
  const markup = page.slice(page.indexOf('<SiteLayout'), page.indexOf('<style>'));
  assert.doesNotMatch(markup, /substack\.com\/p\/|Eens per maand|Once a month|Tot nu toe|Published so far|Schrijf je in|Subscribe/);
});

test('geen generieke bezoekclaim of "Overnachten bij <huis>" in de UI-copy (LAT-14489)', () => {
  const src = read('src/lib/ui-strings.ts');
  assert.doesNotMatch(src, /net bezochten|we just visited/);
  assert.match(src, /'wijnhuis\.staynear\.labelPrefix': 'Overnachten in de buurt van'/);
  assert.doesNotMatch(src, /'Overnachten bij'/);
});
