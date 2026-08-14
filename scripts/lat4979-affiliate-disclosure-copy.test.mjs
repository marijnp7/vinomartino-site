// LAT-4979 — regressietest op de per-blok affiliate-disclosure en de resterende
// proefnotitie-datalabels.
//
// De disclosure-regel in AffiliateBlockDisclosure.astro stond als kale NL-tekst
// in de template en rendeerde daardoor Nederlands op /en/. Het was de laatste
// bron van de `wijnhuis`-gate-marker (LAT-4911: 2 van 131 pagina's). De
// proefnotitie-labels hadden wél een key in UI_STRING_DEFAULTS maar geen
// EN-waarde — precies het faalpatroon dat LAT-4911 al eens opleverde.
//
// Zelfde drieslag als lat4911-wijnhuis-template-copy.test.mjs:
//
//   1. Byte-identiteit op NL. De uit de dictionary samengestelde zin moet exact
//      de literal opleveren die vóór deze wijziging in de template stond.
//   2. EN-dekking. Een key toevoegen zónder EN-waarde reproduceert het issue,
//      dus dat faalt hier.
//   3. Geen terugkeer van de literals in de bron.
//
// Rendering zelf wordt niet getest — de Astro-vite-pipeline draait niet onder
// `node --test`. De DoD-verificatie is de gate-run op de gebouwde HTML.
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
const { AFFILIATE_BLOCKS } = await import('../src/lib/affiliates.ts');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const DISCLOSURE = src('../src/components/AffiliateBlockDisclosure.astro');
const PLACEHOLDER = src('../src/components/AffiliatePlaceholder.astro');
const PROEFNOTITIE = src('../src/components/ProefnotitieKaart.astro');

/** Spiegelt de compositie in AffiliateBlockDisclosure.astro. */
function disclosure(ui, { producent, bezoekMaand, bezoekJaar, linkBron }) {
  const bronLabel = {
    'Booking.com': 'Booking.com',
    GetYourGuide: 'GetYourGuide',
    'directe link': ui.t('affiliate.blockDisclosure.bron.directeLink'),
  };
  const maandKey = `ui.maand.${bezoekMaand.trim().toLowerCase()}`;
  const maandLabel = ui.t(maandKey);
  const maand = maandLabel === maandKey ? bezoekMaand.toLowerCase() : maandLabel;
  const bezoek = ui
    .t('affiliate.blockDisclosure.bezoek')
    .replace('{producent}', producent)
    .replace('{maand}', maand)
    .replace('{jaar}', String(bezoekJaar));
  const reservering = ui.t('affiliate.blockDisclosure.reservering').replace('{bron}', bronLabel[linkBron]);
  return `${bezoek} ${reservering}`;
}

const ALLE_BLOKKEN = Object.values(AFFILIATE_BLOCKS).flat();

test('NL blijft byte-identiek aan de literals die in de template stonden', async () => {
  const nl = await loadUiStrings('nl');

  // Vangnet: zonder blokken bewijst de loop hieronder niets.
  assert.ok(ALLE_BLOKKEN.length >= 6, `verwachtte >=6 affiliate-blokken, vond ${ALLE_BLOKKEN.length}`);

  for (const blok of ALLE_BLOKKEN) {
    const bron = {
      'Booking.com': 'Booking.com',
      GetYourGuide: 'GetYourGuide',
      'directe link': 'de directe link naar het wijnhuis',
    }[blok.linkBron];
    const verwacht =
      `Wij bezochten ${blok.producent} in ${blok.bezoekMaand.toLowerCase()} ${blok.bezoekJaar}. ` +
      `Reservering via ${bron}, VinoMartino ontvangt commissie, prijs voor jou identiek.`;
    assert.equal(disclosure(nl, blok), verwacht, `NL-disclosure van ${blok.producent} is veranderd`);
  }

  assert.equal(nl.t('ui.proefnotitie.gedronkenLabel'), 'Gedronken in');
  assert.equal(nl.t('ui.proefnotitie.prijsLabel'), 'Prijs');
  assert.equal(nl.t('ui.proefnotitie.datarij1Labels'), 'Jaar / Wijnmaker / Appellation');
});

test('elke maandnaam uit de affiliate-data heeft een dictionary-key', () => {
  for (const blok of ALLE_BLOKKEN) {
    const key = `ui.maand.${blok.bezoekMaand.trim().toLowerCase()}`;
    assert.ok(key in UI_STRING_DEFAULTS, `${key} ontbreekt (bezoekMaand '${blok.bezoekMaand}')`);
  }
  // Alle twaalf, niet alleen de vier die nu in de data voorkomen: een nieuw blok
  // in een nog niet gebruikte maand mag geen NL-maand op /en/ opleveren.
  for (const m of ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december']) {
    assert.ok(`ui.maand.${m}` in UI_STRING_DEFAULTS, `ui.maand.${m} ontbreekt in UI_STRING_DEFAULTS`);
    assert.ok(`ui.maand.${m}` in UI_STRING_EN, `ui.maand.${m} heeft geen EN-waarde`);
  }
});

test('elke key uit deze componenten heeft een EN-waarde die van NL verschilt', async () => {
  const bronnen = [DISCLOSURE, PROEFNOTITIE].join('\n');
  // `ui\n  .t('…')` komt in AffiliateBlockDisclosure.astro voor, dus whitespace
  // rond de punt moet mee — anders vindt de regex de helft en is de test stil
  // groen over de keys die hij mist.
  const keys = [
    ...new Set([...bronnen.matchAll(/ui\s*\.\s*t\('((?:affiliate\.blockDisclosure|ui\.proefnotitie)\.[^']+)'\)/g)]
      .map((m) => m[1])),
  ];

  // Vangnet: als de regex niets vindt is de test stil groen zonder iets te bewijzen.
  assert.ok(keys.length >= 6, `verwachtte >=6 keys, vond ${keys.length}`);

  const en = await loadUiStrings('en');
  for (const key of keys) {
    assert.ok(key in UI_STRING_EN, `${key} heeft geen UI_STRING_EN-waarde en valt dus NL terug op /en/`);
    assert.notEqual(en.t(key), UI_STRING_DEFAULTS[key], `EN-waarde van ${key} is gelijk aan de NL-default`);
  }

  // `datarij1Labels` wordt (nog) niet via ui.t() gelezen — de kaart rendert daar
  // de dataveldwaarden zelf. De key stond wel in de LAT-4979-opdracht, dus
  // expliciet los geasserteerd i.p.v. stilzwijgend ongedekt te blijven.
  assert.equal(en.t('ui.proefnotitie.datarij1Labels'), 'Vintage / Producer / Appellation');
  assert.equal(en.t('ui.proefnotitie.gedronkenLabel'), 'Drunk in');
});

test('de EN-disclosure bevat geen NL meer en luidt zoals goedgekeurd', async () => {
  const en = await loadUiStrings('en');
  const directeLink = ALLE_BLOKKEN.find((b) => b.linkBron === 'directe link');
  assert.ok(directeLink, "geen blok met linkBron 'directe link' — de wijnhuis-marker-casus ontbreekt");

  const zin = disclosure(en, directeLink);
  // Vastgesteld door de CEO op LAT-4979 (2026-08-14), letterlijk. Board-approval
  // bee76a8a maakte disclosure-copy R1-self-approvable; de Lead Editor mag deze
  // zin dus aanscherpen — mits de drie M1-Optie-B-elementen intact blijven, en
  // dan verhuist die formulering hierheen.
  const GOEDGEKEURD =
    'Booking via the direct link to the winery. VinoMartino receives a commission — your price is unchanged.';
  assert.ok(zin.endsWith(GOEDGEKEURD), `goedgekeurde EN-disclosure niet gevonden in: ${zin}`);
  assert.equal(zin, `We visited ${directeLink.producent} in ${en.t(`ui.maand.${directeLink.bezoekMaand.toLowerCase()}`)} ${directeLink.bezoekJaar}. ` + GOEDGEKEURD);

  // De drie elementen die M1-Optie B verplicht stelt, in deze volgorde. Een
  // herformulering die er één laat vallen is een compliance-regressie, geen
  // stijlkeuze — daarom apart geasserteerd van de letterlijke tekst hierboven.
  const i = (s) => zin.indexOf(s);
  assert.ok(i('direct link to the winery') > 0, 'element 1 (mechanisme) ontbreekt');
  assert.ok(i('receives a commission') > i('direct link to the winery'), 'element 2 (commissie) ontbreekt of staat voor element 1');
  assert.ok(i('your price is unchanged') > i('receives a commission'), 'element 3 (geen meerprijs) ontbreekt of staat te vroeg');
  assert.ok(!/\b(may|typically|usually|can)\b/.test(GOEDGEKEURD), 'voorbehoud in de disclosure — de CEO eiste een zin zonder hedging');

  // De gate-markers die deze regel op /en/ achterliet.
  for (const blok of ALLE_BLOKKEN) {
    const woorden = disclosure(en, blok).toLowerCase();
    for (const marker of ['wijnhuis', 'reservering', 'bezochten', 'commissie', 'prijs voor jou']) {
      assert.ok(!woorden.includes(marker), `NL-marker "${marker}" staat nog in de EN-disclosure van ${blok.producent}`);
    }
  }
});

test('geen hardcoded NL-copy meer in de affiliate-disclosure-templates', () => {
  for (const literal of [
    'Wij bezochten',
    'Reservering via',
    'ontvangt commissie',
    'prijs voor jou identiek',
    'de directe link naar het wijnhuis',
  ]) {
    assert.ok(
      !DISCLOSURE.includes(literal),
      `NL-literal "${literal}" staat weer hardcoded in AffiliateBlockDisclosure.astro`,
    );
  }

  // Zonder deze doorgifte leest het component altijd de NL-default, ook op /en/
  // — dan is bovenstaande dictionary-bedrading dood gewicht.
  assert.match(
    PLACEHOLDER,
    /<AffiliateBlockDisclosure[\s\S]{0,400}?locale=\{locale\}[\s\S]{0,80}?\/>/,
    'AffiliatePlaceholder.astro geeft `locale` niet door aan AffiliateBlockDisclosure',
  );
  assert.match(DISCLOSURE, /loadUiStrings\(locale\)/, 'AffiliateBlockDisclosure.astro leest de dictionary niet');
});
