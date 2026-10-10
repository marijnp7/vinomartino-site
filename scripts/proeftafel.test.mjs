// LAT-13099: regressietest "Op de proeftafel".
// Bewaakt:
//   1. elke ui.t()-key in de proeftafel-componenten heeft een NL-default én een EN-waarde;
//   2. geen em-dash in de nieuwe strings; alleen de voornaam Marijn, nooit "Martin";
//   3. geen verzendadres op de site (postcode/straat-patroon) in strings of templates;
//   4. NL- en EN-pagina's bestaan; de streekpagina rendert het blok;
//   5. nginx-route /api/inzendingen/wijn is POST-only en proxyt naar wijn_inzendingen;
//   6. het schema-script zet public create zonder `status` in de veld-whitelist.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const COMPONENT_DIR = 'src/components/proeftafel/';
const components = readdirSync(new URL(COMPONENT_DIR, root)).filter((f) => f.endsWith('.astro'));
const sources = components.map((f) => read(COMPONENT_DIR + f)).join('\n');
const PREFIX = 'proeftafel.';
const newKeys = Object.keys(UI_STRING_DEFAULTS).filter((k) => k.startsWith(PREFIX));

test('components gebruiken alleen bestaande keys (NL + EN)', () => {
  const used = new Set();
  for (const m of sources.matchAll(/ui\.t\(\s*['"`]([^'"`$]+)['"`]\s*\)/g)) used.add(m[1]);
  for (const m of sources.matchAll(/\bT\(\s*['"`]([^'"`$]+)['"`]\s*\)/g)) used.add(`proeftafel.insturen.${m[1]}`);
  assert.ok(used.size > 20, `te weinig keys gevonden (${used.size}); regex kapot?`);
  for (const k of used) {
    assert.ok(UI_STRING_DEFAULTS[k], `NL-default ontbreekt: ${k}`);
    assert.ok(UI_STRING_EN[k], `EN-waarde ontbreekt: ${k}`);
  }
});

test('elke proeftafel-key heeft NL en EN', () => {
  assert.ok(newKeys.length > 50);
  for (const k of newKeys) assert.ok(UI_STRING_EN[k], `EN ontbreekt: ${k}`);
  // dynamische keys (verdict/kleur/prijsband/insturen-opties) gedekt
  for (const v of ['kopen', 'proberen', 'laten-staan', 'niet-beoordeeld']) assert.ok(UI_STRING_DEFAULTS[`proeftafel.verdict.${v}`]);
  for (const v of ['rood', 'wit', 'rose', 'mousserend', 'zoet', 'oranje']) assert.ok(UI_STRING_EN[`proeftafel.kleur.${v}`]);
  for (const v of ['tot-12', '12-25', 'boven-25']) assert.ok(UI_STRING_EN[`proeftafel.prijsband.${v}`]);
  for (const v of ['onafhankelijk', 'elk_oordeel', 'geen_garantie', 'privacy']) assert.ok(UI_STRING_EN[`proeftafel.insturen.akkoord.${v}`]);
});

const values = newKeys.flatMap((k) => [UI_STRING_DEFAULTS[k], UI_STRING_EN[k]]);

test('merkpoort: geen em-dash, geen Martin, alleen voornaam', () => {
  for (const v of values) {
    assert.ok(!/[—–]/.test(v), `gedachtestreepje in: ${v}`);
    assert.ok(!/\bMartin\b/.test(v), `"Martin" in: ${v}`);
    assert.ok(!/Marijn\s+[A-Z][a-z]+/.test(v.replace(/Marijn (will|je|mailt)\b/g, '')), `mogelijke achternaam na Marijn: ${v}`);
  }
  assert.equal(UI_STRING_DEFAULTS['proeftafel.author.name'], 'Marijn');
  assert.ok(!/[—]/.test(sources), 'em-dash in een proeftafel-template');
});

test('geen verzendadres op de site', () => {
  const ADDRESS = [/\b\d{4}\s?[A-Z]{2}\b/, /(straat|laan|weg|plein|gracht)\s+\d+/i, /\b(postbus|p\.o\. box)\b/i];
  for (const text of [...values, sources]) {
    for (const re of ADDRESS) assert.ok(!re.test(text), `adres-patroon ${re} gevonden`);
  }
  // De intro moet expliciet zeggen dat het een aanmelding is en Marijn het adres mailt.
  assert.match(UI_STRING_DEFAULTS['proeftafel.insturen.intro'], /aanmelding/);
  assert.match(UI_STRING_DEFAULTS['proeftafel.insturen.intro'], /mailt Marijn je het verzendadres/);
});

test('pagina\'s bestaan (NL + EN) en streekpagina rendert het blok', () => {
  for (const p of ['index.astro', '[slug].astro', 'insturen.astro']) {
    assert.ok(existsSync(new URL(`src/pages/op-de-proeftafel/${p}`, root)), `NL ${p}`);
    assert.ok(existsSync(new URL(`src/pages/en/op-de-proeftafel/${p}`, root)), `EN ${p}`);
  }
  assert.match(read('src/components/StreekDetail.astro'), /<GeproefdUitStreek streekSlug=\{entry\.slug\}/);
  const detail = read('src/components/proeftafel/ProeftafelDetail.astro');
  assert.match(detail, /'@type': 'Review'/);
  assert.ok(!/ratingValue|reviewRating/.test(detail), 'geen numerieke rating in JSON-LD');
});

test('insturen-formulier: honeypot, min-invultijd, maxlength 300, max 2 flessen, 4 akkoorden', () => {
  const f = read('src/components/proeftafel/ProeftafelInsturen.astro');
  assert.match(f, /name="website"/);
  assert.match(f, /MIN_FILL_MS/);
  assert.match(f, /name="toelichting" maxlength="300"/);
  assert.match(f, /name="aantal_flessen" type="number" min="1" max="2"/);
  assert.match(f, /AKKOORD = \['onafhankelijk', 'elk_oordeel', 'geen_garantie'\]/);
  assert.match(f, /name="akkoord_privacy" required/);
  assert.match(f, /fetch\('\/api\/inzendingen\/wijn'/);
});

test('nginx: /api/inzendingen/wijn is POST-only naar wijn_inzendingen', () => {
  const conf = read('nginx-prod.conf');
  const m = conf.match(/location = \/api\/inzendingen\/wijn \{([\s\S]*?)\n    \}/);
  assert.ok(m, 'route ontbreekt');
  assert.match(m[1], /if \(\$request_method != POST\) \{ return 405; \}/);
  assert.match(m[1], /limit_req zone=inzendingen/);
  assert.match(m[1], /vinomartino-directus-1:8055\/items\/wijn_inzendingen;/);
  assert.match(conf, /limit_req_zone \$binary_remote_addr zone=inzendingen:/);
});

test('schema-script: public create zonder status, read alleen published', () => {
  const s = read('directus/scripts/create-proeftafel-schema.mjs');
  assert.match(s, /filter\(\(f\) => f !== 'status' && f !== 'date_created'\)/);
  assert.match(s, /ensurePermission\(pub, 'wijn_reviews', 'read', \{ permissions: published \}/);
  assert.ok(!/ensurePermission\(pub, 'wijn_inzendingen', '(read|update|delete)'/.test(s), 'public mag inzendingen niet lezen/wijzigen');
  assert.match(s, /--dry-run/);
  assert.match(s, /type: 'mail'/);
});
