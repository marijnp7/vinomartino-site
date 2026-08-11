// LAT-4918 — `/artikelen/ik-weet-het-ik-drink-toch-wijn/` is bewust NL-only.
//
// Redactionele beslissing (Lead Editor, LAT-4917): het artikel hangt aan het
// Gezondheidsraad-advies van 25 juni 2026 en de behandeling daarvan in de Tweede
// Kamer — Nederlandse beleidscontext zonder zinvol EN-equivalent. Deze test
// bewaakt de technische vastlegging daarvan, niet de beslissing zelf.
//
// Wat hier omvalt als iemand het mechanisme verkeerd aanpakt:
//
//   1. Als `/artikelen/` als PREFIX in EN_MISSING_PREFIXES beladt, stelt dat de
//      hele familie vrij en verdwijnt elk toekomstig artikel-vertaalgat stilletjes
//      uit de gate. Test 2 en 3 vangen dat.
//   2. Als de gate zijn eigen kopie van de uitzondering zou krijgen, drijft die
//      af van de site. LAT-4917 vroeg expliciet om GEEN tweede lijst; de
//      Python-kant leest daarom src/lib/i18n.ts. Zie de counterpart-test in
//      scripts/lat2582-gate-check.test.py (TestExactNlOnlyPath).
//
// Het tweede artikel uit LAT-4917 (`wijnoogst-vervroegd-klimaat-wijnreis`) krijgt
// juist WEL een EN-vertaling en hoort hier dus nooit in te staan.
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

const { localizeHref, isEnMissingPath } = await import('../src/lib/i18n.ts');

const NL_ONLY = '/artikelen/ik-weet-het-ik-drink-toch-wijn/';
const VERTAALD = '/artikelen/wijnoogst-vervroegd-klimaat-wijnreis/';

test('het NL-only artikel blijft op het kale NL-pad in de EN-boom', () => {
  assert.equal(isEnMissingPath(NL_ONLY), true);
  assert.equal(localizeHref(NL_ONLY, 'en'), NL_ONLY);
  // zonder trailing slash, zoals body-links hem soms dragen
  assert.equal(localizeHref(NL_ONLY.replace(/\/$/, ''), 'en'), NL_ONLY.replace(/\/$/, ''));
  // query/hash horen mee te blijven lopen, ongelokaliseerd
  assert.equal(localizeHref(`${NL_ONLY}#bron`, 'en'), `${NL_ONLY}#bron`);
});

test('de rest van /artikelen/ wordt gewoon gelokaliseerd', () => {
  assert.equal(isEnMissingPath(VERTAALD), false);
  assert.equal(localizeHref(VERTAALD, 'en'), `/en${VERTAALD}`);
  assert.equal(localizeHref('/artikelen/', 'en'), '/en/artikelen/');
});

test('NL-zijde blijft byte-identiek', () => {
  assert.equal(localizeHref(NL_ONLY, 'nl'), NL_ONLY);
  assert.equal(localizeHref(VERTAALD, 'nl'), VERTAALD);
});

test('de uitzondering staat als EXACT pad genoteerd, niet als prefix', () => {
  const src = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8');
  const exact = /const EN_MISSING_EXACT_PATHS[^=]*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(exact, 'EN_MISSING_EXACT_PATHS ontbreekt in src/lib/i18n.ts');
  assert.match(exact[1], /'\/artikelen\/ik-weet-het-ik-drink-toch-wijn\/'/);
  assert.doesNotMatch(exact[1], /wijnoogst-vervroegd-klimaat-wijnreis/);

  const prefixes = /const EN_MISSING_PREFIXES[^=]*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(prefixes, 'EN_MISSING_PREFIXES ontbreekt in src/lib/i18n.ts');
  assert.doesNotMatch(prefixes[1], /artikelen/);
});

test('de bestaande families en hun uitzondering blijven staan', () => {
  // regressiehek op de refactor naar isEnMissingPath: EN_PRESENT_EXACT_PATHS
  // moet de familie-regel nog steeds kunnen opheffen.
  assert.equal(isEnMissingPath('/reizen-nareizen/langhe/'), true);
  assert.equal(isEnMissingPath('/reizen-nareizen/'), false);
  assert.equal(localizeHref('/reizen-nareizen/', 'en'), '/en/reizen-nareizen/');
  assert.equal(localizeHref('/reizen-nareizen/langhe/', 'en'), '/reizen-nareizen/langhe/');
  assert.equal(isEnMissingPath('/seizoenskalender/'), true);
});
