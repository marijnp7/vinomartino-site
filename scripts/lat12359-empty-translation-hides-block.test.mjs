// LAT-12359 — een lege EN-vertaling van een leestekst-blok mag op /en/ nooit de NL-tekst tonen.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { applyTranslationGuard, hasTranslatedText } = await import('../src/lib/directus-i18n.ts');
const ARTICLES_LIB = readFileSync(new URL('../src/lib/articles.ts', import.meta.url), 'utf8');

const HIDE = ['eerst_dit_boeken', 'proefnotities', 'cta_blocks'];
const nl = {
  id: 1,
  title: 'NL',
  eerst_dit_boeken: [{ naam: 'Agriturismo', handeling: 'Zes weken van tevoren boeken' }],
  proefnotities: [{ wijnnaam: 'Barolo', notitie: 'Donker fruit', prijs: '35' }],
  cta_blocks: { primary: { why: 'Omdat het kan' } },
};

test('hasTranslatedText: alleen lege strings/objecten tellen niet', () => {
  assert.equal(hasTranslatedText(undefined), false);
  assert.equal(hasTranslatedText(''), false);
  assert.equal(hasTranslatedText([{ naam: ' ', handeling: '' }]), false);
  assert.equal(hasTranslatedText([{ naam: 'x' }]), true);
});

test('lege EN-velden verbergen het blok (null), ook als alle tekst-keys leeg zijn', () => {
  const overlay = new Map([['1', { title: 'EN', eerst_dit_boeken: [{ naam: '', handeling: '' }] }]]);
  const [out] = applyTranslationGuard([nl], overlay, 'en', 'id', HIDE);
  assert.equal(out.title, 'EN');
  assert.equal(out.eerst_dit_boeken, null);
  assert.equal(out.proefnotities, null);
  assert.equal(out.cta_blocks, null);
});

test('gevulde EN-vertaling blijft deep-merge met NL-basis (prijs behouden)', () => {
  const overlay = new Map([['1', { proefnotities: [{ wijnnaam: 'Barolo', notitie: 'Dark fruit' }] }]]);
  const [out] = applyTranslationGuard([nl], overlay, 'en', 'id', HIDE);
  assert.equal(out.proefnotities[0].notitie, 'Dark fruit');
  assert.equal(out.proefnotities[0].prijs, '35');
});

test('NL is ongewijzigd en zonder hide-lijst blijft het oude gedrag bestaan', () => {
  assert.equal(applyTranslationGuard([nl], new Map(), 'nl', 'id', HIDE)[0], nl);
  const overlay = new Map([['1', { title: 'EN' }]]);
  assert.deepEqual(applyTranslationGuard([nl], overlay, 'en')[0].eerst_dit_boeken, nl.eerst_dit_boeken);
});

test('articles.ts geeft de hide-lijst door aan localizeRecords', () => {
  assert.match(ARTICLES_LIB, /hideWhenUntranslated: ARTICLES_HIDE_WHEN_UNTRANSLATED/);
  assert.match(ARTICLES_LIB, /ARTICLES_HIDE_WHEN_UNTRANSLATED = \['eerst_dit_boeken', 'proefnotities', 'cta_blocks'\]/);
});
