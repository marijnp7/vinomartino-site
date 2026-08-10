// LAT-3209 — regressietest op de /seizoenskalender-landingspagina.
//
// De pagina mag NIET publiek bereikbaar zijn zolang de PDF geblokkeerd is
// (LAT-2684/LAT-2318). Die eigenschap is verspreid over vier bestanden en is
// precies het soort ding dat een latere, goedbedoelde refactor stilletjes
// opheft. Deze test bewaakt de drie sluitingen plus het verplicht-veld-gedrag:
//
//   1. de route wordt niet gegenereerd zonder SEIZOENSKALENDER_ENABLED=1
//   2. een lege/ontbrekende Directus-rij levert geen pagina op en geen
//      fallback-copy
//   3. de route staat nergens gelinkt en zit niet in de sitemap
//   4. `region_preference` wordt op dit form altijd meegestuurd (geen
//      "verwijder leeg veld"-bypass zoals bij de artikel-footer-form)
//
// Geen nieuwe dependency: dezelfde resolve-hook als de andere tests hier, zodat
// Node de TS-bronnen rechtstreeks leest.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
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

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const { loadLandingPage, hasRenderableContent } = await import('../src/lib/landing-pages.ts');

// --------------------------------------------------------------------------
// 1 + 2 — loader: geen rij, geen pagina, geen fallback-copy
// --------------------------------------------------------------------------

// LAT-4810: `drafts` pint DIRECTUS_INCLUDE_DRAFTS expliciet in plaats van hem
// uit de omgeving te erven. Zonder die pin erft de test de env van de build:
// deploy.yml zet DIRECTUS_INCLUDE_DRAFTS=1 voor PREVIEW-builds (LAT-1112), en
// dan levert statusFilterQuery() `_in=published,draft` op. De test hieronder
// die "alleen published in een productie-build" heet, faalde daardoor in elke
// preview-build en slaagde lokaal en in productie — een verschil dat niemand
// zag omdat er tot LAT-4810 geen enkele CI-stap deze test draaide.
// Dezelfde pin staat al in scripts/lat4776-beeld-herkomst.test.mjs.
function withDirectus(responder, fn, { drafts = false } = {}) {
  const realFetch = globalThis.fetch;
  const realUrl = process.env['DIRECTUS_URL'];
  const realToken = process.env['DIRECTUS_TOKEN'];
  const realDrafts = process.env['DIRECTUS_INCLUDE_DRAFTS'];
  process.env['DIRECTUS_URL'] = 'http://directus.test';
  process.env['DIRECTUS_TOKEN'] = 'test-token';
  if (drafts) process.env['DIRECTUS_INCLUDE_DRAFTS'] = '1';
  else delete process.env['DIRECTUS_INCLUDE_DRAFTS'];
  globalThis.fetch = responder;
  return (async () => {
    try {
      return await fn();
    } finally {
      globalThis.fetch = realFetch;
      if (realUrl === undefined) delete process.env['DIRECTUS_URL'];
      else process.env['DIRECTUS_URL'] = realUrl;
      if (realToken === undefined) delete process.env['DIRECTUS_TOKEN'];
      else process.env['DIRECTUS_TOKEN'] = realToken;
      if (realDrafts === undefined) delete process.env['DIRECTUS_INCLUDE_DRAFTS'];
      else process.env['DIRECTUS_INCLUDE_DRAFTS'] = realDrafts;
    }
  })();
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('lege collectie levert null op (geen pagina, geen fallback-copy)', async () => {
  const page = await withDirectus(
    async () => json({ data: [] }),
    () => loadLandingPage('seizoenskalender'),
  );
  assert.equal(page, null);
});

test('collectie bestaat nog niet (404) breekt de build niet', async () => {
  const page = await withDirectus(
    async () => json({ errors: [{ message: 'not found' }] }, 404),
    () => loadLandingPage('seizoenskalender'),
  );
  assert.equal(page, null);
});

test('alleen published wordt opgehaald in een productie-build', async () => {
  let requested = '';
  await withDirectus(
    async (url) => {
      requested = String(url);
      return json({ data: [] });
    },
    () => loadLandingPage('seizoenskalender'),
  );
  assert.match(requested, /filter\[status\]\[_eq\]=published/);
  assert.match(requested, /filter\[slug\]\[_eq\]=seizoenskalender/);
});

// LAT-4810: de keerzijde van de test hierboven. Een preview-build zet
// DIRECTUS_INCLUDE_DRAFTS=1 (deploy.yml, LAT-1112) en moet dan óók drafts
// ophalen. Dat gedrag werd nergens vastgelegd, waardoor de productie-test hem
// per ongeluk "dekte" via de omgeving in plaats van via een assertie.
test('een preview-build haalt published én draft op', async () => {
  let requested = '';
  await withDirectus(
    async (url) => {
      requested = String(url);
      return json({ data: [] });
    },
    () => loadLandingPage('seizoenskalender'),
    { drafts: true },
  );
  assert.match(requested, /filter\[status\]\[_in\]=published,draft/);
  assert.doesNotMatch(requested, /filter\[status\]\[_eq\]=published/);
});

test('lege velden blijven leeg: de template krijgt geen verzonnen tekst', async () => {
  const page = await withDirectus(
    async () =>
      json({
        data: [
          {
            slug: 'seizoenskalender',
            hero_heading: 'Kop',
            hero_lede: '   ',
            value_items: [{ title: '', body: '' }, { title: 'Wel', body: '' }],
          },
        ],
      }),
    () => loadLandingPage('seizoenskalender'),
  );
  assert.equal(page.heroLede, '', 'whitespace-only veld telt als leeg');
  assert.equal(page.heroKicker, '');
  assert.equal(page.formHeading, '');
  assert.deepEqual(page.valueItems, [{ title: 'Wel', body: '' }], 'half-lege repeater-rij valt weg');
});

test('een rij zonder kop en zonder lede is geen renderbare pagina', () => {
  const empty = {
    slug: 'seizoenskalender',
    heroKicker: 'kicker',
    heroHeading: '',
    heroLede: '',
    valueHeading: '',
    valueItems: [],
    formHeading: '',
    formSuccess: '',
    formError: '',
    seoTitle: '',
    seoDescription: '',
  };
  assert.equal(hasRenderableContent(empty), false);
  assert.equal(hasRenderableContent({ ...empty, heroHeading: 'Kop' }), true);
});

// --------------------------------------------------------------------------
// 3 — de niet-publiceren-sluitingen, op de bron gecontroleerd
// --------------------------------------------------------------------------

test('de route zit achter de feature-flag en rendert niets zonder Directus-rij', () => {
  const src = read('src/pages/seizoenskalender/[...slug].astro');
  assert.match(
    src,
    /process\.env\['SEIZOENSKALENDER_ENABLED'\] !== '1'/,
    'flag-check moet vóór alles in getStaticPaths staan',
  );
  const flagIndex = src.indexOf('SEIZOENSKALENDER_ENABLED');
  const loadIndex = src.indexOf('loadLandingPage(');
  assert.ok(flagIndex > -1 && loadIndex > flagIndex, 'flag wordt vóór de Directus-fetch gecheckt');
  assert.match(src, /noindex/, 'pagina moet noindex meegeven aan SiteLayout');
  assert.doesNotMatch(src, /alternates=/, 'geen hreflang: er is bewust geen EN-tegenhanger');
});

// Astro tilt getStaticPaths naar een eigen modulescope. Een const uit de
// frontmatter is daarbinnen niet zichtbaar, en dat merk je pas bij het
// RENDEREN: de build compileert prima en klapt daarna om op een ReferenceError.
// Precies dat gebeurde tijdens het bouwen van deze pagina, dus het staat hier
// vast: elke identifier die getStaticPaths gebruikt, moet erbinnen gedeclareerd
// zijn of geïmporteerd op modulniveau.
test('getStaticPaths leunt niet op frontmatter-scope (Astro hoist-val)', () => {
  const src = read('src/pages/seizoenskalender/[...slug].astro');
  const body = src.slice(src.indexOf('export async function getStaticPaths()'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);

  // Commentaar telt niet mee: alleen echte code kan een ReferenceError geven.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // Alles in de frontmatter dat BUITEN getStaticPaths gedeclareerd wordt.
  const outside = strip(src.slice(0, src.indexOf('export async function getStaticPaths()')));
  const outsideConsts = [...outside.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(
    (m) => m[1],
  );

  const inside = strip(fn);
  const leaked = outsideConsts.filter((name) => new RegExp(`\\b${name}\\b`).test(inside));
  assert.deepEqual(
    leaked,
    [],
    `getStaticPaths verwijst naar frontmatter-scope (geeft ReferenceError bij render): ${leaked}`,
  );
});

test('/seizoenskalender/ staat niet in de sitemap', () => {
  assert.match(read('astro.config.mjs'), /!page\.includes\('\/seizoenskalender\/'\)/);
});

test('/seizoenskalender/ is als NL-only route geregistreerd', () => {
  assert.match(read('src/lib/i18n.ts'), /EN_MISSING_PREFIXES[\s\S]{0,200}'\/seizoenskalender\/'/);
});

// De eerste versie van deze test zocht op `href="/seizoenskalender…"`. Die ging
// niet rood op een echte footerlink, want de huisstijl hier is
// `href={lh('/colofon/')}` — een expressie, geen quoted attribuut. Daarom nu:
// élke stringliteral met dit pad telt als verdacht, en alleen een expliciet
// benoemde lijst bekende, niet-linkende vermeldingen is toegestaan. Een nieuwe
// vermelding waar dan ook laat de test vallen, óók als het geen link is; dat is
// bewust, want die afweging hoort langs een mens.
const KNOWN_NON_LINK_MENTIONS = ['src/lib/i18n.ts'];

test('geen enkele pagina of component linkt naar /seizoenskalender', () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(astro|ts|tsx|js|mjs|md)$/.test(entry)) continue;
      // De route zelf noemt haar eigen pad uiteraard wel.
      if (full.includes(path.join('pages', 'seizoenskalender'))) continue;
      const src = readFileSync(full, 'utf8')
        // Commentaar telt niet mee: een toelichting is geen link.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/["'`][^"'`]*\/seizoenskalender/.test(src)) found.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepEqual(
    found.sort(),
    [...KNOWN_NON_LINK_MENTIONS].sort(),
    'onverwachte vermelding van /seizoenskalender in src/ — controleer of het een link is',
  );
});

test('de route staat niet in nav_items-seed of footer', () => {
  assert.doesNotMatch(read('directus/scripts/seed-navigation.mjs'), /seizoenskalender/);
  assert.doesNotMatch(read('src/components/SiteFooter.astro'), /seizoenskalender/);
});

// --------------------------------------------------------------------------
// 4 — region_preference is verplicht op dit form
// --------------------------------------------------------------------------

test('het regioveld kan required gerenderd worden en het form gebruikt dat', () => {
  const field = read('src/components/NewsletterRegionField.astro');
  assert.match(field, /required\?: boolean/, 'prop bestaat');
  assert.match(field, /required=\{required\}/, 'attribuut komt op de select terecht');
  assert.match(field, /required = false/, 'default blijft optioneel voor de artikel-footer-form');

  const form = read('src/components/SeizoenskalenderForm.astro');
  assert.match(form, /required=\{true\}/, 'de seizoenskalender-form zet het veld op verplicht');
  assert.match(form, /194582697828418830/, 'post naar de Seizoenskalender-form van MailerLite');
  assert.match(
    form,
    /PUBLIC_MAILERLITE_SEIZOENSKALENDER_FORM_ACTION/,
    'endpoint blijft overschrijfbaar via env',
  );
  assert.match(
    form,
    /newsletter\.footer\.lede/,
    'frequentiebelofte komt uit de gedeelde ui-string, niet uit nieuwe copy',
  );
});

test('de "verwijder leeg veld"-bypass geldt niet voor een required regioveld', () => {
  const src = read('src/lib/newsletter-signup.ts');
  assert.match(src, /const regionRequired = Boolean\(regionSelect\?\.required\)/);
  assert.match(src, /if \(!region && !regionRequired\) data\.delete\(REGION_FIELD\)/);
});

test('geen em-dashes in de publieke copy van de seed', () => {
  const seed = read('directus/scripts/seed-landing-page-seizoenskalender.mjs');
  // Alleen de ROW-literal telt als publieke copy; de toelichting erboven niet.
  const start = seed.indexOf('const ROW = {');
  const end = seed.indexOf('async function api');
  assert.ok(start > -1 && end > start);
  assert.equal(seed.slice(start, end).includes('—'), false, 'em-dash in publieke copy');
});
