// LAT-7703 — regressietest op de twee gestructureerde artikel-tekstblokken.
//
// De bug had twee onafhankelijke helften die allebei NL op /en/ lieten lekken,
// en die allebei onzichtbaar zijn voor een Directus-vertaling:
//
//   1. RENDER-GAT. `proefnotities` en `eerst_dit_boeken` stonden niet in
//      ARTICLES_TRANSLATABLE, dus fetchTranslationOverlay vroeg ze nooit op en
//      mapArticle() las ze altijd van het NL-basisrecord. Een EN-waarde in
//      articles_translations werd daardoor STIL genegeerd — er was geen fout,
//      alleen Nederlandse tekst. Dat is precies waarom een test hier moet staan
//      en niet alleen een gate op gerenderde HTML: de gate ziet het pas ná een
//      deploy, en een redacteur die EN-copy invoert ziet helemaal niets.
//
//   2. HARDCODED KOP. EerstDitBoeken.astro las UI_COPY.eerstDitBoekenHeading
//      rechtstreeks in plaats van via de dictionary — dezelfde bug als
//      ProefnotitieKaart.astro in LAT-4911, in het buurcomponent.
//
// Zelfde drieslag als lat4911-wijnhuis-template-copy.test.mjs: NL-byte-identiteit,
// EN-dekking, en geen terugkeer van het patroon in de bron. Rendering zelf draait
// niet onder `node --test`; de DoD-verificatie is de gate-run op de build.
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
const { mergeTranslatedValue } = await import('../src/lib/directus-i18n.ts');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const EERST_DIT_BOEKEN = src('../src/components/EerstDitBoeken.astro');
const ARTIKEL_DETAIL = src('../src/components/ArtikelDetail.astro');
const ARTICLES_LIB = src('../src/lib/articles.ts');

const KEY = 'ui.eerstDitBoeken.heading';

test('NL blijft byte-identiek: de kop is nog steeds "Eerst dit boeken"', async () => {
  assert.equal(UI_STRING_DEFAULTS[KEY], 'Eerst dit boeken');
  const ui = await loadUiStrings('nl');
  assert.equal(ui.t(KEY), 'Eerst dit boeken');
});

test('de kop heeft een EN-waarde die niet naar het NL terugvalt', async () => {
  const en = UI_STRING_EN[KEY];
  assert.ok(en, `${KEY} mist een EN-waarde in UI_STRING_EN — precies de LAT-4911-bug: de key bestaat, de vertaling niet.`);
  assert.notEqual(en, UI_STRING_DEFAULTS[KEY]);
});

test('EerstDitBoeken.astro haalt de kop uit de dictionary, niet uit UI_COPY', () => {
  assert.ok(
    EERST_DIT_BOEKEN.includes(`ui.t('${KEY}')`),
    'EerstDitBoeken.astro moet de kop via ui.t() uit de dictionary halen.',
  );
  assert.ok(
    !/UI_COPY\.eerstDitBoekenHeading/.test(EERST_DIT_BOEKEN),
    'UI_COPY.eerstDitBoekenHeading is terug in het component — die omzeilt de EN-laag volledig.',
  );
  // Zonder locale-prop valt loadUiStrings terug op NL en rendert /en/ alsnog
  // Nederlands; de dictionary-aanroep alléén is dus geen bewijs.
  assert.ok(/locale\??:\s*Locale/.test(EERST_DIT_BOEKEN), 'EerstDitBoeken.astro moet een locale-prop accepteren.');
});

test('ArtikelDetail.astro geeft de locale door aan beide blok-componenten', () => {
  for (const tag of ['EerstDitBoeken', 'ProefnotitieKaart']) {
    const m = ARTIKEL_DETAIL.match(new RegExp(`<${tag}\\b[^>]*>`));
    assert.ok(m, `<${tag} …> niet gevonden in ArtikelDetail.astro`);
    assert.ok(
      /locale=\{locale\}/.test(m[0]),
      `<${tag}> krijgt geen locale mee — de dictionary valt dan terug op NL op /en/.`,
    );
  }
});

test('proefnotities en eerst_dit_boeken staan in ARTICLES_TRANSLATABLE', () => {
  const m = ARTICLES_LIB.match(/const ARTICLES_TRANSLATABLE = \[([^\]]*)\]/);
  assert.ok(m, 'ARTICLES_TRANSLATABLE niet gevonden in src/lib/articles.ts');
  const fields = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  for (const f of ['proefnotities', 'eerst_dit_boeken']) {
    assert.ok(
      fields.includes(f),
      `${f} ontbreekt in ARTICLES_TRANSLATABLE — een EN-waarde in articles_translations.${f} wordt dan stil genegeerd.`,
    );
  }
});

test('de deep-merge houdt niet-vertaalde subvelden uit de NL-basis', () => {
  // De EN-blob draagt bewust alleen de tekst-keys. Zou de merge wholesale
  // vervangen, dan verliest de proefnotitie z'n etiket-UUID en prijs en valt de
  // kaart door de render-filter (`filter((n) => n && n.wijnnaam)`).
  const nl = [
    { wijnnaam: 'Blanc de Noirs', prijs: '32,00', etiket_foto: 'uuid-1', notitie: 'Witte wijn geperst van blauwe druiven.' },
    { wijnnaam: 'Millésime 2012', jaar: '2012', notitie: 'Notig en gerijpt.' },
  ];
  const en = [{ notitie: 'A white wine pressed from black grapes.' }, {}];
  const merged = mergeTranslatedValue(nl, en);
  assert.equal(merged[0].notitie, 'A white wine pressed from black grapes.');
  assert.equal(merged[0].wijnnaam, 'Blanc de Noirs');
  assert.equal(merged[0].etiket_foto, 'uuid-1');
  assert.equal(merged[0].prijs, '32,00');
  // Een item zonder vertaling houdt z'n hele NL-inhoud — het verdwijnt niet.
  assert.equal(merged[1].notitie, 'Notig en gerijpt.');
  assert.equal(merged.length, nl.length);
});
