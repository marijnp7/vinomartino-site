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

const NL_KEYS = /^\s*'((?:newsletter|home\.brief|langhe\.capture)\.[^']+)':\s*(['"`])((?:\\.|(?!\2).)*)\2/gm;
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

test('frequentiebelofte is overal eens per maand, zonder gedachtestreepjes', () => {
  const { nl, en } = copy();
  const pages = ['src/pages/de-brief/index.astro', 'src/pages/en/de-brief/index.astro'].map(read);
  const all = [...Object.values(nl), ...Object.values(en), ...pages].join('\n');
  assert.doesNotMatch(all, /twee weken|two weeks|paar keer per jaar|few times a year/i);
  for (const [k, v] of [...Object.entries(nl), ...Object.entries(en)]) {
    assert.doesNotMatch(v, /[—–]/, `gedachtestreepje in ${k}`);
  }
  for (const p of pages) assert.doesNotMatch(p, /—/, 'gedachtestreepje op de-brief-pagina');
  assert.match(nl['newsletter.inline.body'], /Eens per maand/);
  assert.match(en['newsletter.inline.body'], /Once a month/);
  assert.match(nl['newsletter.footer.lede'], /Eens per maand/);
  assert.match(en['newsletter.footer.lede'], /Once a month/);
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

test('/de-brief noemt de datum van de eerste editie', () => {
  assert.match(read('src/pages/de-brief/index.astro'), /eerste editie verschijnt op 5 november/);
  assert.match(read('src/pages/en/de-brief/index.astro'), /first edition arrives on 5 November/);
});

test('geen voorbeeldbrief die zich als echte editie 1 voordoet', () => {
  for (const f of ['src/pages/de-brief/index.astro', 'src/pages/en/de-brief/index.astro']) {
    assert.doesNotMatch(read(f), /editie 1|edition 1/i);
  }
});
