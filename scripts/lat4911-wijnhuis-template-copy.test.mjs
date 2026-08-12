// LAT-4911 — regressietest op de wijnhuis-template-chrome. De labels
// `Wijnhuis-portret`, `STREEK` en `Het verhaal` stonden als kale NL-literals in
// WijnhuisPageContent.astro en renderden daardoor op ~130 /en/wijnhuizen/-pagina's
// in het Nederlands (geverifieerd tegen live prod, 2026-08-11).
//
// Zelfde drieslag als i18n-voetblok-copy.test.mjs (LAT-2820):
//
//   1. Byte-identiteit op NL. Elke key moet exact de literal teruggeven die
//      vóór deze wijziging in de template stond. `loadUiStrings('nl')` doet geen
//      Directus-fetch (fetchUiStrings short-circuit op DEFAULT_LOCALE), dus de
//      NL-HTML is byte-identiek zolang deze asserties staan.
//
//   2. EN-dekking. De hele bug was dat een key wél bestond maar geen EN-waarde
//      had (`wijnhuis.breadcrumb.index`, `wijnhuis.staynear.*` zaten al in
//      UI_STRING_DEFAULTS en vielen tóch NL terug op /en/). Een key toevoegen
//      zonder EN-waarde reproduceert dit issue precies, dus dat faalt hier.
//
//   3. Geen terugkeer van de literals in de bron. De gate (lat2582-gate-check.py)
//      meet gerenderde HTML en ziet een regressie pas ná de build; deze test ziet
//      hem in CI.
//
// Rendering zelf wordt hier niet getest — de Astro-vite-pipeline draait niet
// onder `node --test`. De DoD-verificatie is de gate-run op de gebouwde HTML.
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

const { UI_STRING_DEFAULTS, UI_STRING_EN, loadUiStrings } = await import('../src/lib/ui-strings.ts');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const PAGE_CONTENT = src('../src/components/pages/WijnhuisPageContent.astro');
const DETAIL = src('../src/components/WijnhuisDetail.astro');
const STAYNEAR = src('../src/components/WijnhuisStayNear.astro');
const RELATED = src('../src/components/RelatedEntities.astro');
const ITINERARY = src('../src/components/RouteItineraryDays.astro');
const GEOMAP = src('../src/components/RouteGeoMap.astro');

/** key → de literal die vóór LAT-4911 in de template stond. */
const NL_WAS = {
  'wijnhuis.hero.eyebrow': 'Wijnhuis-portret',
  'wijnhuis.meta.streek': 'STREEK',
  'wijnhuis.meta.route': 'ROUTE',
  'wijnhuis.meta.sinds': 'SINDS',
  'wijnhuis.meta.hectaren': 'HECTAREN',
  'wijnhuis.meta.biologisch': 'BIOLOGISCH',
  'wijnhuis.meta.biologisch.ja': 'Ja',
  'wijnhuis.drieluik.beeldenVanPrefix': 'Beelden van',
  'wijnhuis.story.label': '§ Het verhaal',
  'wijnhuis.wines.eyebrow': 'De wijnen',
  'wijnhuis.wines.title': 'Wat we proefden',
  'wijnhuis.visit.eyebrow': 'Bezoek',
  'wijnhuis.visit.title': 'Voor je heen rijdt',
  'wijnhuis.visit.mapsCta': 'Open in Google Maps →',
  'wijnhuis.visit.reserveCta': 'Reservering aanvragen',
  'wijnhuis.related.label': 'Gerelateerd',
  'wijnhuis.related.title': 'Meer wijnhuizen in deze streek',
  // RelatedEntities.astro — zelfde bug, ander component: het laadde de
  // dictionary niet eens, waardoor deze zes labels NL renderden op /en/artikelen/.
  'related.label': 'Gerelateerd',
  'related.title': 'Lees verder',
  'related.kind.streek': 'Streek',
  'related.kind.wijnhuis': 'Wijnhuis',
  'related.kind.wijnroute': 'Wijnroute',
  'related.kind.land': 'Land',
  // RouteItineraryDays.astro + RouteGeoMap.astro — vierde en vijfde vindplaats:
  // stop-soorten en kaart-chrome op de 11 /en/wijnroutes/-pagina's.
  'route.stop.wijnhuis': 'Wijnhuis',
  'route.stop.eten': 'Eten',
  'route.stop.bezienswaardigheid': 'Bezienswaardigheid',
  'route.stop.overnachting': 'Overnachting',
  'routegeo.label': 'Routekaart',
  'routegeo.aria.mapPre': 'Kaart van de route',
  'routegeo.legend.aria': 'Legenda',
  'routegeo.legend.dagetappe': 'Dagetappe',
  'routegeo.legend.wijnhuis': 'Wijnhuis',
  'routegeo.legend.overnachten': 'Overnachten',
};

/**
 * Keys waarvan de EN-waarde bewust gelijk is aan de NL-default. Zonder deze
 * uitzonderingslijst zou test 3 een key die je vergeet te vertalen niet kunnen
 * onderscheiden van een key die terecht niet vertaald wordt.
 */
const EN_IDENTIEK_MET_REDEN = {
  // Eigennaam (Google Maps) + universele frase; door de Lead Editor bevestigd.
  'wijnhuis.visit.mapsCta': 'merknaam',
  // Hetzelfde woord in beide talen.
  'wijnhuis.meta.route': 'leenwoord',
};

test('NL-defaults zijn byte-identiek aan de literals van vóór LAT-4911', async () => {
  const ui = await loadUiStrings('nl');
  for (const [key, was] of Object.entries(NL_WAS)) {
    assert.equal(ui.t(key), was, `NL-copy veranderd voor ${key}`);
  }
});

test('elke ui.t()-key in de wijnhuis-templates heeft een NL-default', () => {
  const bronnen = { PAGE_CONTENT, DETAIL, STAYNEAR, RELATED, ITINERARY, GEOMAP };
  for (const [naam, bron] of Object.entries(bronnen)) {
    for (const key of [...bron.matchAll(/ui\.t\('([^']+)'\)/g)].map((m) => m[1])) {
      assert.ok(key in UI_STRING_DEFAULTS, `ontbrekende NL-default voor ${key} (${naam})`);
    }
  }
});

test('elke wijnhuis.*-key die op /en/ rendert heeft een EN-waarde', async () => {
  const bronnen = [PAGE_CONTENT, DETAIL, STAYNEAR, RELATED, ITINERARY, GEOMAP].join('\n');
  const keys = [...new Set([...bronnen.matchAll(/ui\.t\('((?:wijnhuis|related|route\.stop|routegeo)\.[^']+)'\)/g)].map((m) => m[1]))];

  // Vangnet: als de regex niets vindt is de test stil groen zonder iets te bewijzen.
  assert.ok(keys.length >= 36, `verwachtte >=36 template-keys, vond ${keys.length}`);

  const en = await loadUiStrings('en');
  for (const key of keys) {
    assert.ok(key in UI_STRING_EN, `${key} heeft geen UI_STRING_EN-waarde en valt dus NL terug op /en/`);
    if (!(key in EN_IDENTIEK_MET_REDEN)) {
      assert.notEqual(
        en.t(key),
        UI_STRING_DEFAULTS[key],
        `EN-waarde van ${key} is gelijk aan de NL-default; zet hem in EN_IDENTIEK_MET_REDEN als dat klopt`,
      );
    }
  }
});

test('geen hardcoded NL-copy meer in de wijnhuis-templates', () => {
  // Zusje van NL_NOUNS_PENDING in lat2582-gate-check.py, geen kopie: die lijst
  // meet gerenderde HTML, deze meet de bron.
  const verboden = [
    'Wijnhuis-portret',
    '>STREEK<',
    '>SINDS<',
    '>HECTAREN<',
    '>BIOLOGISCH<',
    '§ Het verhaal',
    'De wijnen',
    'Wat we proefden',
    'Voor je heen rijdt',
    'Reservering aanvragen',
    'Meer wijnhuizen in deze streek',
    'Beelden van',
  ];
  for (const literal of verboden) {
    assert.ok(
      !PAGE_CONTENT.includes(literal),
      `NL-literal "${literal}" staat weer hardcoded in WijnhuisPageContent.astro`,
    );
  }
  assert.ok(
    !/biologisch=\{[^}]*'Ja'/.test(DETAIL),
    `de waarde 'Ja' staat weer hardcoded in WijnhuisDetail.astro`,
  );
  for (const literal of ['>Gerelateerd<', "'Lees verder'", "streek: 'Streek'", "wijnhuis: 'Wijnhuis'"]) {
    assert.ok(
      !RELATED.includes(literal),
      `NL-literal "${literal}" staat weer hardcoded in RelatedEntities.astro`,
    );
  }
  for (const literal of ["bezienswaardigheid: 'Bezienswaardigheid'", "wijnhuis: 'Wijnhuis'"]) {
    assert.ok(
      !ITINERARY.includes(literal),
      `NL-literal "${literal}" staat weer hardcoded in RouteItineraryDays.astro`,
    );
  }
  for (const literal of ['>Routekaart<', '>Dagetappe<', '>Wijnhuis<', '>Overnachten<', 'aria-label="Legenda"']) {
    assert.ok(
      !GEOMAP.includes(literal),
      `NL-literal "${literal}" staat weer hardcoded in RouteGeoMap.astro`,
    );
  }
});
