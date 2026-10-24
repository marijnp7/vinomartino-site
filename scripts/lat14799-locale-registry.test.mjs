// LAT-14799 — generiek taalregister (fase 1 meertaligheid DE/FR/ES/IT).
// Bewaakt twee dingen: (1) NL/EN gedragen zich byte-identiek aan vóór het register,
// (2) een taal in het register maar niet in ENABLED_LOCALES heeft geen effect.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_REGISTRY, ENABLED_LOCALES, LOCALES, HREFLANG, HTML_LANG, OG_LOCALE, DATE_LOCALE,
  isLocale, localeFromPath, stripLocale, localizePath, localizeHref,
} from '../src/lib/i18n.ts';

test('alleen nl en en staan aan', () => {
  assert.deepEqual([...ENABLED_LOCALES], ['nl', 'en']);
  assert.deepEqual([...LOCALES], ['nl', 'en']);
  assert.deepEqual(Object.keys(LOCALE_REGISTRY).sort(), ['de', 'en', 'es', 'fr', 'it', 'nl']);
});

test('metadata NL/EN ongewijzigd', () => {
  assert.deepEqual(HREFLANG, { nl: 'nl', en: 'en' });
  assert.deepEqual(HTML_LANG, { nl: 'nl', en: 'en' });
  assert.deepEqual(OG_LOCALE, { nl: 'nl_NL', en: 'en_US' });
  assert.deepEqual(DATE_LOCALE, { nl: 'nl-NL', en: 'en-GB' });
});

test('padhelpers NL/EN ongewijzigd', () => {
  assert.equal(localeFromPath('/en'), 'en');
  assert.equal(localeFromPath('/en/streken/x/'), 'en');
  assert.equal(localeFromPath('/streken/x/'), 'nl');
  assert.equal(localeFromPath('/english/'), 'nl');
  assert.equal(stripLocale('/en'), '/');
  assert.equal(stripLocale('/en/streken/x/'), '/streken/x/');
  assert.equal(stripLocale('/streken/x/'), '/streken/x/');
  assert.equal(localizePath('/', 'en'), '/en/');
  assert.equal(localizePath('/streken/x/', 'en'), '/en/streken/x/');
  assert.equal(localizePath('/en/streken/x/', 'nl'), '/streken/x/');
  assert.equal(localizeHref('/streken/x/', 'en'), '/en/streken/x/');
});

test('uitgeschakelde talen hebben geen effect', () => {
  for (const l of ['de', 'fr', 'es', 'it']) {
    assert.equal(isLocale(l), false);
    assert.equal(localeFromPath(`/${l}/streken/x/`), 'nl');
    assert.equal(stripLocale(`/${l}/streken/x/`), `/${l}/streken/x/`);
  }
});

// LAT-14810 — fase 1 stap 2a: datumnotatie, valuta, sortering en /en-voorvoegsels
// komen uit het register, niet uit een vaste `locale === 'en'`-keuze.
import { COLLATION, localePrefix } from '../src/lib/i18n.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

test('COLLATION en localePrefix NL/EN ongewijzigd', () => {
  assert.deepEqual(COLLATION, { nl: 'nl', en: 'en' });
  assert.equal(localePrefix('nl'), '');
  assert.equal(localePrefix('en'), '/en');
});

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(astro|ts)$/.test(n) ? [p] : [];
  });
}

test('geen vaste en/nl-keuze meer voor datum, valuta, sortering of /en-voorvoegsel', () => {
  const banned = [
    /locale === 'en' \? 'en-GB' : 'nl-NL'/,
    /locale === 'en' \? 'en' : 'nl'/,
    /locale === 'en' \? '\/en' : ''/,
    /isEn \? '\/en[/']/,
  ];
  const hits = [];
  for (const f of walk('src')) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => { if (banned.some((re) => re.test(line))) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], 'gebruik DATE_LOCALE / COLLATION / localePrefix / localizePath uit src/lib/i18n.ts');
});

// LAT-14810 — fase 1 stap 2b (deel 1): auteursvelden via localizedField, vaste
// Dag/Day- en portret-copy via ui_strings, ui-strings zonder locale-tak.
import { localizedField } from '../src/lib/i18n.ts';

test('localizedField: NL kaal veld, EN variant met terugval', () => {
  const a = { bio: 'nl', bioEn: 'en', role: 'rol' };
  assert.equal(localizedField(a, 'bio', 'nl'), 'nl');
  assert.equal(localizedField(a, 'bio', 'en'), 'en');
  assert.equal(localizedField(a, 'role', 'en'), 'rol');
  assert.equal(localizedField({ bio: 'nl', bioEn: '' }, 'bio', 'en'), '');
});

test('geen vaste EN-copy of En-veldkeuze meer in templates en ui-strings', () => {
  const banned = [
    /locale === 'en' \? '[A-Z][^']*' : '/,
    /locale === 'en' \? \w+\.\w+En \?\?/,
  ];
  const hits = [];
  for (const f of walk('src')) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => { if (banned.some((re) => re.test(line))) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], 'gebruik ui_strings (ui.t) of localizedField uit src/lib/i18n.ts');
  assert.doesNotMatch(readFileSync('src/lib/ui-strings.ts', 'utf8'), /locale === 'en'/);
});

// LAT-14811 — fase 1 stap 2c: geen locale === 'en'/isEn-tak meer in src/, behalve
// regels die direct onder een commentaar "LAT-14811: bewust EN-specifiek" staan.
// seo.ts (meta-templates) volgt in een eigen stap en is tot dan uitgezonderd.
import { STAY22_LANG } from '../src/lib/affiliate-locale.ts';
import { pageUrl } from '../src/lib/pins.ts';

test('stay22-lang en pin-URL uit het register, NL/EN ongewijzigd', () => {
  assert.deepEqual(STAY22_LANG, { en: 'en' });
  assert.equal(pageUrl('nl', 'x'), 'https://vinomartino.com/artikelen/x/');
  assert.equal(pageUrl('en', 'x'), 'https://vinomartino.com/en/artikelen/x/');
});

test('geen locale-tak buiten de bewuste EN-uitzonderingen', () => {
  const PENDING = new Set(['src/lib/seo.ts']);
  const branch = /locale === 'en'|\bisEn\b|lang === 'en'/;
  const hits = [];
  for (const f of walk('src')) {
    if (PENDING.has(f.replaceAll('\\', '/'))) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!branch.test(line)) return;
      if (/LAT-14811: bewust EN-specifiek/.test(lines[i - 1] ?? '')) return;
      hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], 'copy naar ui_strings, logica via LOCALE_REGISTRY, of markeer bewust EN-specifiek');
});

test('nieuwe ui_strings-keys staan in NL en EN', async () => {
  const src = readFileSync('src/lib/ui-strings.ts', 'utf8');
  const keys = [...src.matchAll(/"((?:search|map\.europe|home\.routesMap)\.[^"]+)":/g)].map((m) => m[1]);
  const count = new Map();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  assert.ok(count.size >= 34, `te weinig keys: ${count.size}`);
  for (const [k, n] of count) assert.equal(n, 2, `${k} moet in NL én EN staan`);
});
