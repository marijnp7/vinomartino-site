// LAT-10472 — regressietest op de inline affiliate-blokken ("Waar te slapen" /
// "Where to sleep") op reisartikelen.
//
// De bug leek op een vertaalgat maar was er geen. De EN-content stond al compleet
// in Directus (accommodations_translations/214), AffiliatePlaceholder.astro kreeg
// netjes een `locale`, en de kop rendert al EN via de ui-strings-overlay. Toch
// lekte het blok NL op /en/:
//
//   1. COPY UIT EEN CONFIG-BESTAND, NIET UIT EEN VERTAALLAAG. `description` en
//      `ctaLabel` komen uit AFFILIATE_BLOCKS in src/lib/affiliates.ts — literals
//      naast de CJ-config. Die passeren nóch de ui-strings-dictionary nóch de
//      Directus-overlay, dus geen enkele vertaalroute kon ze raken. Een redacteur
//      die EN-copy in Directus zet ziet niets veranderen.
//
//   2. DE LITERAL WINT VAN DE DICTIONARY. In AffiliatePlaceholder.astro geldt
//      `ctaLabel ?? label.cta`. Zolang de config een NL `ctaLabel` meegeeft, is
//      een EN-waarde op `affiliate.block.*.cta` onbereikbaar. Beide helften
//      moeten dus dicht — vandaar de tests op allebei.
//
// Zelfde drieslag als lat7703-artikel-blokken-i18n.test.mjs: NL-byte-identiteit,
// EN-dekking, en geen terugkeer van het patroon in de bron. Rendering draait niet
// onder `node --test`; de DoD-verificatie is de gate-run op de build.
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

const { AFFILIATE_BLOCKS, getAffiliateBlock } = await import('../src/lib/affiliates.ts');
const { UI_STRING_DEFAULTS, UI_STRING_EN } = await import('../src/lib/ui-strings.ts');

const ARTIKEL_DETAIL = readFileSync(
  new URL('../src/components/ArtikelDetail.astro', import.meta.url),
  'utf8',
);

const TOSCANE = 'wijnreizen-toscane-voorbij-de-toeristische-chianti-route';

// De markers die lat2582-gate-check.py op deze pagina meldde. Een EN-string die
// er één van bevat, laat de gate opnieuw rood worden.
const NL_MARKERS = ['bekijk', 'wijngaarden', 'domein', 'beschikbaarheid', 'proeverij'];

test('NL blijft byte-identiek: de Toscane-accommodatie houdt zijn NL-copy', () => {
  const nl = getAffiliateBlock(TOSCANE, 'accommodation', 'nl');
  assert.equal(nl.ctaLabel, 'Bekijk beschikbaarheid');
  assert.equal(
    nl.description,
    "Vier kamers boven het Eroica Caffè op het domein van Barone Ricasoli. Wij liepen er 's ochtends door de wijngaarden naar de kasteelmuren.",
  );
  // De default-aanroep (zonder locale) is óók NL — anders zou elke bestaande
  // call-site die de prop nog niet doorgeeft stil van taal wisselen.
  assert.deepEqual(getAffiliateBlock(TOSCANE, 'accommodation'), nl);
});

test('EN levert andere copy dan NL op de lekkende Toscane-blokken', () => {
  const en = getAffiliateBlock(TOSCANE, 'accommodation', 'en');
  const nl = getAffiliateBlock(TOSCANE, 'accommodation', 'nl');
  assert.notEqual(en.description, nl.description);
  assert.notEqual(en.ctaLabel, nl.ctaLabel);
});

test('geen enkel affiliate-blok laat een NL-literal door op locale "en"', () => {
  const misses = [];
  for (const [slug, blocks] of Object.entries(AFFILIATE_BLOCKS)) {
    for (const block of blocks) {
      const en = getAffiliateBlock(slug, block.location, 'en');
      for (const field of ['description', 'ctaLabel']) {
        const value = en[field];
        if (!value) continue;
        const hit = NL_MARKERS.find((m) => value.toLowerCase().includes(m));
        if (hit) misses.push(`${slug}/${block.location}.${field}: NL-marker "${hit}" in ${JSON.stringify(value)}`);
      }
    }
  }
  assert.deepEqual(
    misses,
    [],
    `EN-variant ontbreekt of is nog NL — voeg descriptionEn/ctaLabelEn toe in affiliates.ts:\n${misses.join('\n')}`,
  );
});

test('ArtikelDetail.astro geeft de locale door aan getAffiliateBlock', () => {
  const calls = [...ARTIKEL_DETAIL.matchAll(/getAffiliateBlock\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3, 'verwacht accommodation/activity/sidebar-aanroepen');
  for (const args of calls) {
    assert.ok(
      /,\s*locale\s*$/.test(args.trim()),
      `getAffiliateBlock(${args}) mist de locale-parameter — dan valt het blok terug op NL, ook op /en/.`,
    );
  }
});

test('de fallback-CTA-keys hebben een EN-waarde die niet naar het NL terugvalt', () => {
  // Deze keys dragen het blok zodra een config géén eigen ctaLabel meegeeft.
  const keys = [
    'affiliate.block.accommodation.title',
    'affiliate.block.accommodation.desc',
    'affiliate.block.accommodation.cta',
    'affiliate.block.activity.cta',
    'affiliate.block.sidebar.cta',
    'ui.cta.primary.fallbackCta',
  ];
  for (const key of keys) {
    const en = UI_STRING_EN[key];
    assert.ok(en, `${key} mist een EN-waarde in UI_STRING_EN — de key bestaat, de vertaling niet.`);
    assert.notEqual(en, UI_STRING_DEFAULTS[key], `${key} heeft een EN-waarde die gelijk is aan de NL-default.`);
  }
});
