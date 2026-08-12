// LAT-2829 — regressietest op de vertaal-overlay voor cross-linkblokken.
//
// De bug: loaders selecteren de titel/naam van een cross-link via een geneste
// M2M-hop rechtstreeks op de parent-collectie (`related_articles.articles_id.title`),
// waar alléén NL staat. De overlay uit directus-i18n werd op de parent-entiteit
// toegepast, niet op die geneste refs — dus elk "Lees ook"-blok op /en/ toonde
// Nederlandse titels terwijl de EN-vertaling gewoon bestond.
//
// Drie lagen bewaking:
//
//   1. collectNestedRefs herkent de junction-vormen die de loaders opleveren
//      ({ articles_id: {...} }, plat, kale id) zonder te struikelen.
//
//   2. localizeRefsBySlug koppelt op slug (niet op PK — de geneste selecties
//      vragen bewust geen `id` op, zie de comment in directus-i18n.ts), overlayt
//      zacht (geen vertaling → NL blijft), en breekt de build NIET als de
//      overlay-fetch faalt.
//
//   3. Statische guard: elke loader die een cross-link-label via een geneste hop
//      selecteert, roept ook daadwerkelijk de overlay aan. Dat is wat voorkomt
//      dat een nieuwe loader het patroon opnieuw introduceert.
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

const { collectNestedRefs, localizeRefsBySlug, localizeNestedRefs } = await import(
  '../src/lib/directus-i18n.ts'
);

const ENV = { url: 'http://directus.test', token: 't', configured: true, includeDrafts: false };

/**
 * Stub voor globalThis.fetch. `index` = de `id,slug`-indexquery op de collectie,
 * `translations` = de junction-rijen. Elke handler mag ook 'FAIL' teruggeven om
 * een HTTP-fout te simuleren.
 */
function stubDirectus({ index = [], translations = [], failIndex = false, failTranslations = false }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const isTranslations = String(url).includes('_translations');
    const fail = isTranslations ? failTranslations : failIndex;
    if (fail) return new Response('nope', { status: 403, statusText: 'Forbidden' });
    const data = isTranslations ? translations : index;
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test('collectNestedRefs herkent de junction-vormen uit de loaders', () => {
  const records = [
    {
      related_articles: [
        { articles_id: { slug: 'rioja', title: 'Rioja NL' } }, // genest (normaal)
        { slug: 'mosel', title: 'Mosel NL' }, // plat (fallback-selectie)
        { articles_id: 42 }, // kale id → geen label om te vertalen
        null,
        'garbage',
      ],
    },
    { related_articles: null }, // veld gedegradeerd uit de field-tier
    null,
  ];
  const refs = collectNestedRefs(records, 'related_articles', 'articles_id');
  assert.deepEqual(
    refs.map((r) => r.slug),
    ['rioja', 'mosel'],
  );
});

test('localizeRefsBySlug overlayt op slug en laat href/slug ongemoeid', async () => {
  const stub = stubDirectus({
    index: [
      { id: '1', slug: 'rioja' },
      { id: '2', slug: 'mosel' },
    ],
    translations: [
      { articles_id: '1', title: 'Rioja Wine: Classic or Modern' },
      { articles_id: '2', title: 'A week along the Mosel' },
    ],
  });
  try {
    const refs = [
      { slug: 'rioja', title: 'Rioja: klassiek of modern' },
      { slug: 'mosel', title: 'De Riesling van 2018 en die van 1999' },
    ];
    await localizeRefsBySlug(refs, {
      env: ENV,
      collection: 'articles',
      junction: 'articles_translations',
      parentIdField: 'articles_id',
      fields: ['title'],
      locale: 'en',
    });
    assert.equal(refs[0].title, 'Rioja Wine: Classic or Modern');
    assert.equal(refs[1].title, 'A week along the Mosel');
    assert.equal(refs[0].slug, 'rioja', 'slug blijft NL-canoniek — de href mag niet verschuiven');
  } finally {
    stub.restore();
  }
});

test('zonder EN-vertaling blijft de NL-titel staan (zacht, geen drop)', async () => {
  const stub = stubDirectus({
    index: [
      { id: '1', slug: 'sancerre' },
      { id: '2', slug: 'priorat' },
    ],
    translations: [{ articles_id: '1', title: 'Sancerre, the Loire Sauvignon' }],
  });
  try {
    const refs = [
      { slug: 'sancerre', title: 'Sancerre, de Loire-Sauvignon' },
      { slug: 'priorat', title: 'Priorat: leisteen en oudhout' },
    ];
    await localizeRefsBySlug(refs, {
      env: ENV,
      collection: 'articles-soft',
      junction: 'articles_translations',
      parentIdField: 'articles_id',
      fields: ['title'],
      locale: 'en',
    });
    assert.equal(refs[0].title, 'Sancerre, the Loire Sauvignon');
    assert.equal(refs[1].title, 'Priorat: leisteen en oudhout');
  } finally {
    stub.restore();
  }
});

test('NL is een no-op: geen enkele query, geen mutatie', async () => {
  const stub = stubDirectus({ index: [], translations: [] });
  try {
    const refs = [{ slug: 'rioja', title: 'Rioja: klassiek of modern' }];
    await localizeRefsBySlug(refs, {
      env: ENV,
      collection: 'articles-nl',
      junction: 'articles_translations',
      parentIdField: 'articles_id',
      fields: ['title'],
      locale: 'nl',
    });
    assert.equal(stub.calls.length, 0);
    assert.equal(refs[0].title, 'Rioja: klassiek of modern');
  } finally {
    stub.restore();
  }
});

test('een falende overlay-fetch breekt de build niet — NL-labels blijven staan', async () => {
  const stub = stubDirectus({ failTranslations: true });
  try {
    const refs = [{ slug: 'rioja', title: 'Rioja: klassiek of modern' }];
    await localizeRefsBySlug(refs, {
      env: ENV,
      collection: 'articles-fail',
      junction: 'articles_translations',
      parentIdField: 'articles_id',
      fields: ['title'],
      locale: 'en',
    });
    assert.equal(refs[0].title, 'Rioja: klassiek of modern');
  } finally {
    stub.restore();
  }
});

test('localizeNestedRefs patcht de refs zoals de loader ze doorgeeft', async () => {
  const stub = stubDirectus({
    index: [{ id: '7', slug: 'rhone' }],
    translations: [{ streken_id: '7', name: 'Rhône Valley' }],
  });
  try {
    const records = [{ related_streken: [{ streken_id: { slug: 'rhone', name: 'Rhônedal' } }] }];
    await localizeNestedRefs(records, 'related_streken', 'streken_id', {
      env: ENV,
      collection: 'streken',
      junction: 'streken_translations',
      parentIdField: 'streken_id',
      fields: ['name'],
      locale: 'en',
    });
    assert.equal(records[0].related_streken[0].streken_id.name, 'Rhône Valley');
  } finally {
    stub.restore();
  }
});

test('de overlay wordt per (collectie, junction, locale, velden) gememoïseerd', async () => {
  const stub = stubDirectus({
    index: [{ id: '1', slug: 'a' }],
    translations: [{ articles_id: '1', title: 'A (EN)' }],
  });
  try {
    const opts = {
      env: ENV,
      collection: 'articles-memo',
      junction: 'articles_translations',
      parentIdField: 'articles_id',
      fields: ['title'],
      locale: 'en',
    };
    await localizeRefsBySlug([{ slug: 'a', title: 'A' }], opts);
    const afterFirst = stub.calls.length;
    await localizeRefsBySlug([{ slug: 'a', title: 'A' }], opts);
    assert.equal(afterFirst, 2, 'eerste ronde: één index- + één translations-query');
    assert.equal(stub.calls.length, 2, 'tweede ronde mag niets extra ophalen');
  } finally {
    stub.restore();
  }
});

// --- Statische guard -------------------------------------------------------
// Elke loader die een cross-link-label via een geneste hop selecteert, moet het
// ook overlayen. Dit is de test die voorkomt dat LAT-2829 opnieuw insluipt.
const LOADERS = [
  'landen.ts',
  'routes.ts',
  'wijnhuizen.ts',
  'streken.ts',
  'articles.ts',
  'reispakketten.ts',
  'accommodaties-loader.ts',
];

// Velden die per collectie NIET in de translations-junction zitten (eigennamen).
// Een geneste selectie hierop is dus terecht niet overlayd.
const NOT_TRANSLATABLE = new Set(['wijnhuizen_id.name', 'accommodations_id.name', 'streek_id.slug']);

test('elke geneste label-selectie in de loaders wordt overlayd', () => {
  const misses = [];
  for (const file of LOADERS) {
    const src = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), 'utf8');
    // `<listField>.<refField>.<title|name|description>` in een field-selectie.
    const nested = new Set();
    for (const m of src.matchAll(/([a-z_]+)\.([a-z_]+_id)\.(title|name|description)\b/g)) {
      if (NOT_TRANSLATABLE.has(`${m[2]}.${m[3]}`)) continue;
      nested.add(`${m[1]}.${m[2]}`);
    }
    for (const key of nested) {
      const [listField, refField] = key.split('.');
      const call = new RegExp(
        `localizeNestedRefs\\(\\s*\\w+,\\s*'${listField}',\\s*'${refField}'`,
      );
      if (!call.test(src)) misses.push(`${file}: ${key} wordt geselecteerd maar niet overlayd`);
    }
    // M2O-joins (`streek_id.name`, `land_id.name`) lopen via localizeJoinedRefs
    // of localizeRefsBySlug; controleer dat er überhaupt een overlay staat.
    if (/\b(streek_id|land_id)\.name\b/.test(src)) {
      assert.match(
        src,
        /localizeJoinedRefs|localizeRefsBySlug/,
        `${file}: joint een streek-/landnaam mee zonder overlay`,
      );
    }
  }
  assert.deepEqual(misses, []);
});
