// LAT-12560 (zet 5, taak 5.3) — nieuwsbrief-CTA op clusterpagina's, eerlijke frequentiebelofte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitAfterFirstSection } from '../src/lib/newsletter-inline.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

test('split valt vlak voor de tweede h2', () => {
  const html = '<p>intro</p><h2 id="a">A</h2><p>a</p><h2 id="b">B</h2><p>b</p>';
  const { head, tail } = splitAfterFirstSection(html);
  assert.equal(head, '<p>intro</p><h2 id="a">A</h2><p>a</p>');
  assert.equal(tail, '<h2 id="b">B</h2><p>b</p>');
  assert.equal(head + tail, html);
});

test('split zonder tweede h2 valt na de tweede alinea, zonder alinea\'s blijft alles in head', () => {
  const two = '<p>een</p><p>twee</p><p>drie</p>';
  assert.deepEqual(splitAfterFirstSection(two), { head: '<p>een</p><p>twee</p>', tail: '<p>drie</p>' });
  assert.deepEqual(splitAfterFirstSection(''), { head: '', tail: '' });
  assert.deepEqual(splitAfterFirstSection('<p>een</p>'), { head: '<p>een</p>', tail: '' });
});

test('artikel- en streeksjabloon dragen de CTA na de eerste sectie en de footer aan het eind', () => {
  for (const f of ['src/components/ArtikelDetail.astro', 'src/components/StreekDetail.astro']) {
    const src = read(f);
    assert.match(src, /<NewsletterInline\b/, `${f}: NewsletterInline ontbreekt`);
    assert.match(src, /<NewsletterFooter\b/, `${f}: NewsletterFooter ontbreekt`);
    assert.ok(src.indexOf('<NewsletterInline') < src.indexOf('<NewsletterFooter'), `${f}: volgorde`);
  }
  assert.doesNotMatch(read('src/components/StreekDetail.astro'), /\{entry\.bodyHtml && \(\s*<section class="streek-body"/);
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

test('geen voorbeeldbrief die zich als echte editie 1 voordoet', () => {
  for (const f of ['src/pages/de-brief/index.astro', 'src/pages/en/de-brief/index.astro']) {
    assert.doesNotMatch(read(f), /editie 1|edition 1/i);
  }
});
