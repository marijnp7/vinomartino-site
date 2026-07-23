// LAT-2820 — regressietest op de voetblok-copy. Twee dingen worden bewaakt:
//
//   1. Byte-identiteit op NL. De zin "Dit artikel hoort bij X en Y." is opgeknipt
//      in dictionary-keys; deze test plakt ze weer aan elkaar volgens exact
//      dezelfde regel als de template en vergelijkt met de literal van vóór
//      LAT-2820. Een vertaler die per ongeluk de NL-default aanpast, of een key
//      die een spatie inslikt, valt hier om.
//
//   2. Geen terugkeer van de literals in de bron. De gate (lat2582-gate-check.py)
//      meet gerenderde prod-HTML en ziet een merge pas ná de deploy; deze test
//      ziet hem in CI. Dezelfde strings staan in beide lijsten.
//
// Rendering zelf wordt hier niet getest: de Container API heeft de Astro-vite-
// pipeline nodig en die draait niet onder `node --test`. De DoD-verificatie is
// daarom de gate op gerenderde prod-HTML; dit is het net eronder.
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

const { UI_STRING_DEFAULTS, loadUiStrings } = await import('../src/lib/ui-strings.ts');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const VOETBLOK = src('../src/components/ArtikelVoetblok.astro');

test('NL-defaults plakken terug tot de copy van vóór LAT-2820', async () => {
  const ui = await loadUiStrings('nl');

  // Zoals de template: prefix + ' ' + <streek> + ' ' + join + ' ' + <route> + '.'
  const lede = `${ui.t('voetblok.hoortBijPre')} Langhe ${ui.t('voetblok.hoortBijJoin')} Vier dagen Langhe.`;
  assert.equal(lede, 'Dit artikel hoort bij Langhe en Vier dagen Langhe.');

  // Alleen een streek, geen route: het voegwoord valt weg.
  assert.equal(`${ui.t('voetblok.hoortBijPre')} Langhe.`, 'Dit artikel hoort bij Langhe.');

  assert.equal(ui.t('voetblok.aria'), 'Verder lezen');
  assert.equal(`${ui.t('voetblok.routeThumbAria')} Vier dagen Langhe`, 'Bekijk de route Vier dagen Langhe');
  assert.equal(ui.t('voetblok.hotel.kicker'), 'Overnachten');
  assert.equal(`${ui.t('voetblok.hotel.labelPre')} Langhe`, 'Waar je slaapt in Langhe');
});

test('elke voetblok-key heeft een NL-default (geen key-lek naar de pagina)', () => {
  for (const key of [...VOETBLOK.matchAll(/ui\.t\('([^']+)'\)/g)].map((m) => m[1])) {
    assert.ok(key in UI_STRING_DEFAULTS, `ontbrekende NL-default voor ${key}`);
  }
});

test('geen hardcoded NL-copy meer in ArtikelVoetblok.astro', () => {
  // Spiegelt NL_LITERALS in lat2582-gate-check.py.
  for (const literal of ['Dit artikel hoort bij', 'Waar je slaapt in', 'Overnachten', 'Verder lezen', 'Bekijk de route']) {
    assert.ok(!VOETBLOK.includes(`>${literal}`), `NL-literal terug in de template: ${literal}`);
  }
});

test('elke RouteMap-aanroep geeft locale door', () => {
  // Zonder locale valt RouteMap terug op DEFAULT_LOCALE en staat het aria-label
  // "Route van X naar Y" ook op /en/ (LAT-2820).
  for (const rel of [
    '../src/components/ArtikelVoetblok.astro',
    '../src/components/RouteDetail.astro',
    '../src/components/StreekDetail.astro',
    '../src/components/pages/LandPageContent.astro',
  ]) {
    for (const call of src(rel).match(/<RouteMap[\s\S]*?\/>/g) ?? []) {
      assert.match(call, /locale=\{/, `RouteMap zonder locale in ${rel}: ${call.replace(/\s+/g, ' ')}`);
    }
  }
});
