// LAT-13771 — /accommodaties/ en /accommodaties/<streek>/ in wijnhuizenstijl.
// Structurele regressietest (geen build nodig):
//   1. de keuzehulp-CSS staat in één gedeeld bestand en WijnhuizenIndex definieert hem niet meer lokaal;
//   2. AccommodatieRoundup houdt in de default-variant de groepskoppen en sprong-nav;
//   3. de compacte kaart rekent de CTA via accommodatieBookingHref met dezelfde tracking-attributen;
//   4. alle nieuwe keys hebben een NL-default en een EN-waarde, zonder gedachtestreepjes.
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
const CSS_PATH = new URL('../src/styles/keuzehulp.css', import.meta.url);
const WIJNHUIZEN = src('../src/components/WijnhuizenIndex.astro');
const INDEX = src('../src/components/AccommodatiesIndex.astro');
const PAGE = src('../src/components/AccommodatieRoundupPage.astro');
const ROUNDUP = src('../src/components/AccommodatieRoundup.astro');
const KAART = src('../src/components/AccommodatieKaart.astro');
const styleOf = (code) => (code.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

test('keuzehulp.css bestaat en draagt het filterpaneel, chips, wis-knop en lege staat', () => {
  assert.ok(existsSync(CSS_PATH), 'src/styles/keuzehulp.css ontbreekt');
  const css = readFileSync(CSS_PATH, 'utf8');
  for (const sel of ['.wh-filters {', '.wh-field {', '.wh-chips {', '.wh-wis {', '.wh-leeg {', '.wh-telling {', '.wh-status {']) {
    assert.ok(css.includes(sel), `${sel} ontbreekt in keuzehulp.css`);
  }
  assert.doesNotMatch(css, /:global\(/, 'globaal bestand hoort geen :global() te bevatten');
});

test('WijnhuizenIndex importeert keuzehulp.css en definieert het paneel niet meer lokaal', () => {
  assert.match(WIJNHUIZEN, /import '\.\.\/styles\/keuzehulp\.css';/);
  const css = styleOf(WIJNHUIZEN);
  for (const sel of [/\.wh-filters\s*\{/, /\.wh-field\s*\{/, /\.wh-chips\s*\{/, /\.wh-leeg\s*\{/, /\.wh-telling\s*\{/, /\.wh-wis\s*\{/]) {
    assert.doesNotMatch(css, sel, `${sel} staat nog lokaal in WijnhuizenIndex`);
  }
  // De kaartstijl blijft wél lokaal.
  assert.match(css, /\.wh-card \{/);
});

test('accommodaties-pagina\'s importeren dezelfde keuzehulp.css en de gedeelde client', () => {
  for (const [naam, code] of [['AccommodatiesIndex', INDEX], ['AccommodatieRoundupPage', PAGE]]) {
    assert.match(code, /import '\.\.\/styles\/keuzehulp\.css';/, naam);
    assert.match(code, /<form class="wh-filters[^"]*"[^>]*data-kh-form>/, naam);
    assert.doesNotMatch(code.match(/<form class="wh-filters[^>]*>/)[0], /\shidden[\s>]/, `${naam}: formulier server-side hidden (CLS)`);
    assert.match(code, /<noscript><style is:inline>\.wh-filters \{ display: none !important; \}<\/style><\/noscript>/, naam);
    assert.match(code, /initAlleKeuzehulpen\(\)/, naam);
  }
  assert.match(PAGE, /variant="index"/);
  // Klasse alleen als élke kaart een tier heeft.
  assert.match(PAGE, /kaarten\.every\(\(k\) => Boolean\(k\.tier\)\)/);
  // Intro en planning blijven volledig in de HTML.
  assert.match(PAGE, /set:html=\{waarSlapenIntroHtml\}/);
  assert.match(PAGE, /class="accom-planning"/);
});

test('AccommodatieRoundup: default-variant houdt sprong-nav en groepskoppen', () => {
  assert.match(ROUNDUP, /variant = 'default'/);
  const [, defaultTak] = ROUNDUP.split(/\) : \(<>/);
  assert.ok(defaultTak, 'default-tak niet gevonden');
  assert.match(defaultTak, /class="acc-roundup__nav"/);
  assert.match(defaultTak, /<h3 class="acc-roundup__groep-title">/);
  assert.match(defaultTak, /<AccommodatieKaart kaart=\{kaart\} context=\{context \|\| roundup\.regio\} bronValuta=\{bronValuta\} displayValuta=\{displayValuta\} locale=\{locale\} \/>/);
  assert.match(ROUNDUP, /data-plaats=\{plaatsKort\(kaart\.plaats\)\} data-klasse=\{kaart\.tier \|\| ''\}/);
  assert.match(ROUNDUP, /variant="compact"/);
});

test('compacte kaart: CTA via accommodatieBookingHref met dezelfde tracking als PoiCard', () => {
  assert.match(KAART, /const href = accommodatieBookingHref\(kaart\);/);
  const cta = KAART.match(/<a\s+class="acc-kaart__cta"[\s\S]*?>/);
  assert.ok(cta, 'compacte CTA niet gevonden');
  for (const attr of ['href={href}', 'target="_blank"', 'rel="sponsored noopener"', 'data-affiliate-track',
    'data-affiliate-partner={ctaPartner}', 'data-affiliate-placement="accommodatie-kaart"',
    'data-affiliate-context={ctaContext}', 'data-cta="bekijk-boek"']) {
    assert.ok(cta[0].includes(attr), `CTA mist ${attr}`);
  }
  assert.match(KAART, /const ctaPartner = isAffiliateHref\(href\) \? 'booking\.com' : 'direct';/);
  assert.match(KAART, /const ctaContext = context \? `accommodatie-\$\{context\}` : 'accommodatie';/);
  // PoiCard-pad ongewijzigd.
  assert.match(KAART, /placement: 'accommodatie-kaart',/);
  assert.match(KAART, /ctaKey: 'bekijk-boek',/);
  assert.match(KAART, /hideMediaWhenEmpty: true/);
  // Geen eigen prijslogica: dezelfde `prijs` als de PoiCard.
  assert.equal((KAART.match(/formatNightlyPrice\(/g) || []).length, 2);
  // Beeld alleen uit het eigen veld.
  assert.match(KAART, /<SmartImg src=\{kaart\.foto\}/);
});

const NIEUWE_KEYS = [
  'accommodaties.filter.zoek.label', 'accommodaties.filter.land.label', 'accommodaties.filter.land.alle',
  'accommodaties.filter.plaats.label', 'accommodaties.filter.plaats.alle', 'accommodaties.filter.klasse.label',
  'accommodaties.filter.klasse.alle', 'accommodaties.filter.telling.streken', 'accommodaties.filter.telling.verblijven',
  'accommodaties.filter.wis', 'accommodaties.filter.leeg.titel', 'accommodaties.card.cta', 'accommodaties.kaart.cta',
  'accommodaties.kaart.leesMeer', 'accommodaties.roundup.meerOver',
];

test('alle nieuwe keys hebben NL en EN, zonder gedachtestreepjes', () => {
  for (const key of NIEUWE_KEYS) {
    assert.ok(UI_STRING_DEFAULTS[key], `NL ontbreekt: ${key}`);
    assert.ok(UI_STRING_EN[key], `EN ontbreekt: ${key}`);
    assert.doesNotMatch(UI_STRING_DEFAULTS[key] + UI_STRING_EN[key], /[—–]/, key);
  }
  assert.equal(UI_STRING_DEFAULTS['accommodaties.kaart.cta'], 'Bekijk & boek');
  assert.equal(UI_STRING_EN['accommodaties.filter.telling.verblijven'], '{n} of {totaal} stays');
});

test('elke ui.t()-key in de vier accommodatie-templates heeft NL en EN', () => {
  const keysIn = (code) => [...code.matchAll(/ui\.t\('([^']+)'\)/g)].map((m) => m[1]);
  const keys = [...new Set([INDEX, PAGE, KAART].flatMap(keysIn))].filter((k) => k.startsWith('accommodaties.filter') || k.startsWith('accommodaties.card') || k.startsWith('accommodaties.kaart') || k === 'accommodaties.roundup.meerOver');
  assert.ok(keys.length >= 12, 'te weinig keys gevonden, regex kapot?');
  for (const key of keys) {
    assert.ok(key in UI_STRING_DEFAULTS, `NL ontbreekt: ${key}`);
    assert.ok(key in UI_STRING_EN, `EN ontbreekt: ${key}`);
  }
});

// LAT-13815 — index-aantal moet uit dezelfde bron komen als de streekpagina, en de
// HubBacklink op /en/ mag niet terugvallen op de NL-default.
test('AccommodatiesIndex telt uit loadAccommodatieRoundupPaths, niet uit de losse collectie', () => {
  const idx = src('../src/components/AccommodatiesIndex.astro');
  assert.match(idx, /loadAccommodatieRoundupPaths\(locale\)/);
  assert.doesNotMatch(idx, /loadAccommodatieRoundupsByStreek/);
});

test('hub.italie.backlinkLabel heeft een EN-waarde die afwijkt van NL', () => {
  const en = UI_STRING_EN['hub.italie.backlinkLabel'];
  assert.ok(en, 'EN ontbreekt');
  assert.notEqual(en, UI_STRING_DEFAULTS['hub.italie.backlinkLabel']);
});
