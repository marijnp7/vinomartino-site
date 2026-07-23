// LAT-2826 — regressietest op de "Reizen & nareizen"-listing en de bijbehorende
// pakketdetailpagina. Vier dingen worden bewaakt:
//
//   1. De redactionele NL-copy (Lead Editor, definitief in de ticket) staat
//      letterlijk in de dictionary. Een typo of een ingeslikte spatie in de
//      hero-intro of de SEO-meta valt hier om, niet pas op prod.
//
//   2. NL-byte-identiteit van de detailpagina. LAT-2826 verhuisde de losse
//      NL-literals uit src/pages/reizen-nareizen/[slug].astro naar de dictionary;
//      de defaults moeten exact de oude strings teruggeven.
//
//   3. Geen key-lek: elke ui.t()-key in de twee componenten heeft een NL-default,
//      en elke EN-seedkey bestaat als NL-default (anders seed je een key die de
//      site nooit opvraagt).
//
//   4. localizeHref houdt losse pakket-URL's op NL (er is pas een EN-detailpagina
//      zodra reispakketten_translations gevuld is) maar stuurt het overzicht wél
//      naar /en/reizen-nareizen/.
//
// Rendering zelf wordt hier niet getest: de Container API heeft de Astro-vite-
// pipeline nodig en die draait niet onder `node --test` (zie i18n-voetblok-copy).
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
const { localizeHref } = await import('../src/lib/i18n.ts');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const INDEX = src('../src/components/ReizenNareizenIndex.astro');
const DETAIL = src('../src/components/ReisPakketDetail.astro');
const EN_SEED = JSON.parse(src('../directus/data/ui-strings-en-lat2826.json'));

test('de redactionele NL-copy staat letterlijk in de dictionary', async () => {
  const ui = await loadUiStrings('nl');

  assert.equal(ui.t('reizen.index.hero.h1'), 'Reizen & nareizen');
  assert.equal(
    ui.t('reizen.index.hero.desc'),
    'Elke wijnreis eindigt op de terugreis. Soms in een propvolle intercity met een fles te veel in je rugzak, soms in een stiltecoupé met aantekeningen in een linnen boekje. Hier staan de verhalen die daarna pas goed op gang komen — als de geur van de kelder al verdwenen is maar het gevoel niet.',
  );
  assert.equal(
    ui.t('reizen.index.meta.title'),
    'Reizen & nareizen — wijnreizen van Martino | VinoMartino',
  );
  assert.equal(
    ui.t('reizen.index.meta.description'),
    'Verslagen van wijnreizen door Europa en daarbuiten. Marijn reist, proeft en schrijft — na de reis, als het beter te vertellen is.',
  );
});

test('NL-defaults geven exact de literals van vóór LAT-2826 terug', async () => {
  const ui = await loadUiStrings('nl');

  // Stonden hardcoded in src/pages/reizen-nareizen/[slug].astro (LAT-2023).
  assert.equal(ui.t('reizen.detail.kicker'), 'Reizen nareizen');
  assert.equal(ui.t('reizen.detail.crumbsAria'), 'Breadcrumb');
  assert.equal(ui.t('reizen.detail.section.dagTotDag'), 'Route dag-tot-dag');
  assert.equal(ui.t('reizen.detail.section.wijnhuizen'), 'Wijnhuizen om te boeken');
  assert.equal(ui.t('reizen.detail.section.accommodaties'), 'Waar te slapen');
  assert.equal(ui.t('reizen.detail.section.reismoment'), 'Reismoment');
  assert.equal(ui.t('reizen.detail.leesPortret'), 'Lees portret →');

  // Zoals de template: `${entry.titel}${suffix}` == de oude template-literal.
  assert.equal(
    `Langhe & Piemonte${ui.t('reizen.detail.metaTitleSuffix')}`,
    'Langhe & Piemonte · Reizen nareizen',
  );
});

test('elke ui.t()-key heeft een NL-default (geen key-lek naar de pagina)', () => {
  const keys = [...`${INDEX}\n${DETAIL}`.matchAll(/ui\.t\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'geen enkele ui.t()-aanroep gevonden — regex kapot?');
  for (const key of keys) {
    assert.ok(key in UI_STRING_DEFAULTS, `ontbrekende NL-default voor ${key}`);
  }
});

test('elke EN-seedkey bestaat als NL-default', () => {
  for (const key of Object.keys(EN_SEED)) {
    if (key.startsWith('_')) continue; // _comment
    assert.ok(key in UI_STRING_DEFAULTS, `EN-seed kent key ${key} die de site niet opvraagt`);
  }
});

test('geen hardcoded NL-copy meer in ReisPakketDetail.astro', () => {
  for (const literal of [
    'Route dag-tot-dag',
    'Wijnhuizen om te boeken',
    'Waar te slapen',
    '>Reismoment<',
    'Lees portret',
    'aria-label="Breadcrumb"',
  ]) {
    assert.ok(!DETAIL.includes(literal), `NL-literal terug in de template: ${literal}`);
  }
});

test('localizeHref: overzicht wél naar /en/, losse pakketten blijven NL', () => {
  assert.equal(localizeHref('/reizen-nareizen/', 'en'), '/en/reizen-nareizen/');
  assert.equal(localizeHref('/reizen-nareizen', 'en'), '/en/reizen-nareizen');
  // Geen EN-detailpagina zolang reispakketten_translations leeg is → liever een
  // taalwissel dan een 404 (zie EN_MISSING_PREFIXES in src/lib/i18n.ts).
  assert.equal(localizeHref('/reizen-nareizen/langhe-piemonte/', 'en'), '/reizen-nareizen/langhe-piemonte/');
  // NL blijft onaangeroerd.
  assert.equal(localizeHref('/reizen-nareizen/', 'nl'), '/reizen-nareizen/');
});
