// Besluit 2026-10-05 — regressietest op de samengevoegde wijnroutes-hub.
// "Reizen" (/reizen-nareizen/) en "Wijnroutes" bestonden naast elkaar met
// grotendeels dezelfde inhoud; nu is /wijnroutes/ de ene hub en staan Marijns
// reisverhalen als blok "Zo reisden wij hem" op de routepagina (ReisVerhaal.astro).
// Bewaakt:
//   1. elke ui.t()-key in de hub en het verhaalblok heeft een NL-default én een EN-waarde;
//   2. de hub linkt nergens meer naar /reizen-nareizen/ (die URL is een 301);
//   3. de nav kent geen 'reizen' meer (fallback en seed), en de code filtert een
//      teruggezette CMS-rij weg;
//   4. de 301's in nginx dekken alle vier verhaal-slugs plus de hub, locale-agnostisch;
//   5. /wijnroutes/ heeft een EN-tegenhanger in de i18n-padregels.
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
const { localizeHref, isEnMissingPath } = await import('../src/lib/i18n.ts');
const { VERHAAL_ANCHOR, verhalenVoorRoute } = await import('../src/lib/reis-verhaal.ts');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const HUB = src('../src/components/WijnroutesHub.astro');
const VERHAAL = src('../src/components/ReisVerhaal.astro');
const ROUTE = src('../src/components/RouteDetail.astro');
const NAV = src('../src/lib/navigation.ts');
const SEED = src('../directus/scripts/seed-navigation.mjs');
const NGINX = src('../nginx-prod.conf');
const NGINX_PREVIEW = src('../nginx-preview.conf');

const keysIn = (code) => [...code.matchAll(/ui\.t\('([^']+)'\)/g)].map((m) => m[1]);

test('elke hub- en verhaalkey heeft een NL-default en een EN-waarde', () => {
  const keys = [...new Set([...keysIn(HUB), ...keysIn(VERHAAL)])];
  assert.ok(keys.length > 20, 'te weinig ui.t()-keys gevonden, regex kapot?');
  for (const key of keys) {
    assert.ok(key in UI_STRING_DEFAULTS, `ontbrekende NL-default voor ${key}`);
    assert.ok(key in UI_STRING_EN, `ontbrekende EN-waarde voor ${key}`);
  }
  // Template-key (`reizen.chip.dagen.${b}`) wordt niet door de regex gevangen.
  for (const b of ['1-2', '3-4', '5+']) {
    assert.ok(`reizen.chip.dagen.${b}` in UI_STRING_DEFAULTS);
    assert.ok(`reizen.chip.dagen.${b}` in UI_STRING_EN);
  }
});

test('de hub-copy zegt wat de pagina is: wijnroutes om zelf te rijden', () => {
  assert.equal(UI_STRING_DEFAULTS['wijnroutes.hub.hero.h1'], 'Wijnroutes om zelf te rijden');
  assert.match(UI_STRING_DEFAULTS['wijnroutes.hub.meta.title'], /^Wijnroutes/);
  assert.match(UI_STRING_DEFAULTS['wijnroutes.hub.meta.description'], /slapen/);
  // Geen gedachtestreepjes in redactionele copy (REGEL 58).
  for (const key of Object.keys(UI_STRING_DEFAULTS).filter((k) => k.startsWith('wijnroutes.hub.') || k.startsWith('route.verhaal.'))) {
    assert.doesNotMatch(UI_STRING_DEFAULTS[key], /[—–]/, `gedachtestreepje in ${key}`);
  }
});

test('de hub en het verhaalblok linken niet meer naar /reizen-nareizen/', () => {
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, ''); // commentaar mag de oude URL noemen
  assert.doesNotMatch(code(HUB), /reizen-nareizen/);
  assert.doesNotMatch(code(VERHAAL), /reizen-nareizen/);
  assert.doesNotMatch(code(ROUTE), /reizen-nareizen|ReisCrossLinks/);
  assert.match(HUB, /#\$\{VERHAAL_ANCHOR\}/, 'verhaalkaarten moeten naar het anker op de route linken');
  assert.match(VERHAAL, /id=\{VERHAAL_ANCHOR\}/);
  assert.equal(VERHAAL_ANCHOR, 'zo-reisden-wij');
  assert.match(ROUTE, /<ReisVerhaal verhalen=\{verhalen\}/);
});

test('verhalenVoorRoute koppelt eerst op route_id, dan op streek (LAT-12646)', () => {
  const pakketten = [
    { slug: 'reims', streekSlug: 'champagne', routeSlug: 'champagne-reims' },
    { slug: 'losse', streekSlug: 'champagne', routeSlug: null },
    { slug: 'mosel', streekSlug: 'mosel-duitsland', routeSlug: null },
  ];
  const slugs = (route) => verhalenVoorRoute(pakketten, route).map((p) => p.slug);
  assert.deepEqual(slugs({ slug: 'champagne-reims', streekSlug: 'champagne' }), ['reims', 'losse']);
  assert.deepEqual(slugs({ slug: 'champagne-aube', streekSlug: 'champagne' }), ['losse']);
  assert.deepEqual(slugs({ slug: 'mosel-route', streekSlug: 'mosel-duitsland' }), ['mosel']);
  assert.deepEqual(slugs({ slug: 'x', streekSlug: null }), []);
});

test('nginx: Toscane-verhaal NL naar route 16, EN naar de bestaande route (LAT-12646)', () => {
  for (const conf of [NGINX, NGINX_PREVIEW]) {
    assert.match(conf, /location ~ \^\/reizen-nareizen\/toscane-italie\/\?\$ \{\s*return 301 \/wijnroutes\/toscane-chianti-montalcino-bolgheri-vier-dagen\/;/);
    assert.match(conf, /location ~ \^\/en\/reizen-nareizen\/toscane-italie\/\?\$ \{\s*return 301 \/en\/wijnroutes\/toscane-bolgheri-montalcino-carmignano\/;/);
  }
});

test('verhaalblok staat in beide route-layouts, ook de één-pagina-tak (LAT-12646)', () => {
  const hits = ROUTE.match(/<ReisVerhaal verhalen=\{verhalen\}/g) ?? [];
  assert.equal(hits.length, 2, 'route-one (itinerary.pagina) en de klassieke layout moeten allebei het verhaal tonen');
  const paginaTak = ROUTE.slice(ROUTE.indexOf('{pagina ? ('), ROUTE.indexOf('\n    ) : (\n'));
  assert.match(paginaTak, /<ReisVerhaal verhalen=\{verhalen\}/);
});

test('loader vraagt route_id.slug op met eigen degradatie-tier', () => {
  const L = src('../src/lib/reispakketten.ts');
  assert.match(L, /ROUTE_FIELD = 'route_id\.slug'/);
  assert.match(L, /routeSlug: route\.slug \? String\(route\.slug\) : null/);
  assert.match(L, /missing: 'route_id' \}/);
});

test('verhalenVoorRoute koppelt op streek', () => {
  const pakketten = [{ streekSlug: 'mosel-duitsland', slug: 'a', routeSlug: null }, { streekSlug: 'langhe-piemonte', slug: 'b', routeSlug: null }];
  assert.deepEqual(verhalenVoorRoute(pakketten, { streekSlug: 'mosel-duitsland' }).map((p) => p.slug), ['a']);
  assert.deepEqual(verhalenVoorRoute(pakketten, { streekSlug: null }), []);
  assert.deepEqual(verhalenVoorRoute(pakketten, { streekSlug: 'etna-sicilie' }), []);
});

test('nav: geen Reizen meer, wel een vangnet tegen een teruggezette CMS-rij', () => {
  assert.doesNotMatch(NAV, /href: '\/reizen-nareizen\/'/);
  assert.doesNotMatch(SEED, /key: 'reizen'/);
  assert.match(NAV, /RETIRED_NAV_KEYS = new Set\(\['reizen'\]\)/);
  assert.match(NAV, /!RETIRED_NAV_KEYS\.has\(String\(r\.key\)\)/);
  assert.ok(!('nav.reizen' in UI_STRING_DEFAULTS));
});

test('nginx: 301 voor de hub en elk van de vier verhalen, NL en EN', () => {
  const expect = {
    'mosel-duitsland': 'mosel-bernkastel-traben-trarbach',
    'langhe-piemonte': 'langhe-piemonte',
    'champagne': 'champagne-reims-epernay-montagne-de-reims',
  };
  for (const conf of [NGINX, NGINX_PREVIEW]) {
    for (const [from, to] of Object.entries(expect)) {
      const re = new RegExp(`location ~ \\^\\(/en\\)\\?/reizen-nareizen/${from}/\\?\\$ \\{\\s*return 301 \\$1/wijnroutes/${to}/;`);
      assert.match(conf, re, `301 ontbreekt voor ${from}`);
    }
    assert.match(conf, /location ~ \^\(\/en\)\?\/reizen-nareizen\(\/\.\*\)\?\$ \{\s*return 301 \$1\/wijnroutes\/;/);
  }
  // De catch-all moet NA de specifieke slugs staan (nginx neemt de eerste regex-match).
  const idxCatch = NGINX.indexOf('/reizen-nareizen(/.*)?$');
  for (const from of Object.keys(expect)) assert.ok(NGINX.indexOf(`/reizen-nareizen/${from}/?$`) < idxCatch, `${from} staat na de catch-all`);
});

test('i18n: /wijnroutes/ heeft een EN-tegenhanger, de oude familie staat niet meer in de lijst', () => {
  assert.equal(isEnMissingPath('/wijnroutes/'), false);
  assert.equal(isEnMissingPath('/wijnroutes/langhe-piemonte/'), false);
  assert.equal(localizeHref('/wijnroutes/', 'en'), '/en/wijnroutes/');
  assert.equal(isEnMissingPath('/reizen-nareizen/'), false, 'geen i18n-uitzondering meer nodig voor een 301-URL');
});
