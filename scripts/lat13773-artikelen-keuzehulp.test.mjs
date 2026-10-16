// LAT-13773 — /artikelen/ gebruikt de gedeelde keuzehulp (LAT-13771), geen eigen kopie.
// Structurele regressietest (geen build nodig):
//   1. ArtikelenIndex importeert keuzehulp.css + keuzehulp-client en heeft geen eigen facetpaneel meer;
//   2. Bestemming is meerwaardig (data-kh-lijst, land:/streek:), Rubriek zit onder "Meer filters";
//   3. oude ?rubriek=&land=&streek=-deeplinks worden vertaald naar het fragment;
//   4. de gedeelde client houdt exacte vergelijking zonder data-kh-lijst (accommodaties-plaatsen);
//   5. nieuwe keys hebben NL en EN, zonder gedachtestreepjes; ArticleCard ongewijzigd in gebruik.
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

const { UI_STRING_DEFAULTS, UI_STRING_EN } = await import('../src/lib/ui-strings.ts');
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const INDEX = src('../src/components/ArtikelenIndex.astro');
const CLIENT = src('../src/lib/keuzehulp-client.ts');

test('artikelen gebruikt de gedeelde primitieven en geen eigen facetpaneel', () => {
  assert.match(INDEX, /import '\.\.\/styles\/keuzehulp\.css'/);
  assert.match(INDEX, /from '\.\.\/lib\/keuzehulp-client'/);
  assert.match(INDEX, /initAlleKeuzehulpen\(\)/);
  for (const oud of ['data-filters-panel', 'filter-chip', 'aria-pressed', '.filters-toggle', 'pushState']) {
    assert.ok(!INDEX.includes(oud), `oude facet-implementatie nog aanwezig: ${oud}`);
  }
  for (const el of ['data-kh-root', 'data-kh-form', 'data-kh-zoek', 'data-kh-telling', 'data-kh-chips', 'data-kh-wis', 'data-kh-leeg', 'data-wh-wis-leeg', "'data-kh-card'"]) {
    assert.ok(INDEX.includes(el), `${el} ontbreekt`);
  }
  assert.match(INDEX, /aria-live="polite"/);
  assert.match(INDEX, /<noscript><style is:inline>\.wh-filters \{ display: none !important; \}<\/style><\/noscript>/);
});

test('Bestemming is meerwaardig en Rubriek staat onder Meer filters', () => {
  assert.match(INDEX, /name="bestemming" data-kh-select data-kh-lijst/);
  assert.match(INDEX, /value=\{`land:\$\{slug\}`\}/);
  assert.match(INDEX, /value=\{`streek:\$\{ss\}`\}/);
  const meer = INDEX.slice(INDEX.indexOf('<details class="wh-meer">'), INDEX.indexOf('</details>'));
  assert.match(meer, /name="rubriek" data-kh-select/);
  assert.match(meer, /data-kh-meer-n/);
  assert.match(INDEX, /'data-land': landSlugs\.join\(' '\)/);
  assert.match(INDEX, /'data-streek': streken\.map/);
});

test('oude deeplinks ?rubriek=&land=&streek= worden naar het fragment vertaald', () => {
  assert.match(INDEX, /\['rubriek', 'land', 'streek'\]\.some\(\(k\) => oud\.has\(k\)\)/);
  assert.match(INDEX, /eerste\('streek', 'art-bestemming', 'streek:'\) \|\| eerste\('land', 'art-bestemming', 'land:'\)/);
  assert.match(INDEX, /history\.replaceState/);
});

test('gedeelde client: lijstvergelijking alleen met data-kh-lijst', () => {
  assert.match(CLIENT, /if \(!\('khLijst' in sel\.dataset\)\) return c\.dataset\[sel\.name\] === v;/);
  assert.match(CLIENT, /\.split\(' '\)\.includes\(w\)/);
  assert.match(CLIENT, /o\.dataset\.base \?\? o\.dataset\.label/);
});

test('nieuwe keys: NL-default en EN, geen gedachtestreepjes', () => {
  const keys = Object.keys(UI_STRING_DEFAULTS).filter((k) => k.startsWith('artikelen.filter.'));
  assert.ok(keys.length >= 7, `verwacht >= 7 artikelen.filter.*-keys, kreeg ${keys.length}`);
  for (const k of keys) {
    assert.ok(UI_STRING_EN[k], `EN ontbreekt voor ${k}`);
    for (const v of [UI_STRING_DEFAULTS[k], UI_STRING_EN[k]]) assert.doesNotMatch(v, /[–—]/, `${k}: gedachtestreepje`);
  }
  for (const k of ['artikelen.filter.telling.van']) {
    assert.match(UI_STRING_DEFAULTS[k], /\{n\}.*\{totaal\}/);
    assert.match(UI_STRING_EN[k], /\{n\}.*\{totaal\}/);
  }
});
