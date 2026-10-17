// LAT-13203 — /voor-accommodaties/ (NL en EN) haalt de vertrouwenscopy uit Directus
// ui_strings 554-560 via loadUiStrings, niet als literal in het template (HARDE REGEL 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const KEYS = [
  'voor_accommodaties.meta.description',
  'voor_accommodaties.wie.body',
  'voor_accommodaties.krijgt.1',
  'voor_accommodaties.krijgt.2',
  'voor_accommodaties.krijgt.3',
  'voor_accommodaties.niet_doen.verblijf.titel',
  'voor_accommodaties.niet_doen.verblijf.tekst',
  // LAT-13893: "Wat wij vragen", incl. eigen beeld met credit.
  'voor_accommodaties.vragen.1',
  'voor_accommodaties.vragen.2',
  'voor_accommodaties.vragen.3',
];
const PAGES = {
  nl: 'src/pages/voor-accommodaties.astro',
  en: 'src/pages/en/voor-accommodaties.astro',
};
const uiSrc = readFileSync('src/lib/ui-strings.ts', 'utf8');
const enStart = uiSrc.indexOf('export const UI_STRING_EN');
const sections = { nl: uiSrc.slice(0, enStart), en: uiSrc.slice(enStart) };

function fallback(locale, key) {
  const m = sections[locale].match(new RegExp(`"${key.replace(/\./g, '\\.')}":\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? JSON.parse(`"${m[1]}"`) : null;
}

for (const [locale, path] of Object.entries(PAGES)) {
  const src = readFileSync(path, 'utf8');
  test(`${locale}: pagina laadt loadUiStrings('${locale}')`, () => {
    assert.match(src, new RegExp(`loadUiStrings\\('${locale}'\\)`));
  });
  for (const key of KEYS) {
    test(`${locale}: ${key} via ui.t(), geen literal in het template`, () => {
      assert.ok(src.includes(`ui.t('${key}')`), `ui.t('${key}') ontbreekt in ${path}`);
      const value = fallback(locale, key);
      assert.ok(value, `terugval voor ${key} ontbreekt in UI_STRING_${locale === 'nl' ? 'DEFAULTS' : 'EN'}`);
      assert.ok(!src.includes(value.slice(0, 40)), `${key} staat nog als literal in ${path}`);
    });
  }
}
