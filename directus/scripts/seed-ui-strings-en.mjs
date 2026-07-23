#!/usr/bin/env node
/**
 * LAT-2771 — seed ontbrekende EN `ui_strings_translations` in Directus.
 *
 * Herbruikbare tegenhanger van de ad-hoc seeds uit LAT-2710/LAT-2713, nu wel in
 * de repo zodat elke volgende ui_strings-gat met hetzelfde script te dichten is.
 *
 * Contract (zie src/lib/ui-strings.ts):
 *   ui_strings              (PK id, uniek `key`)
 *   ui_strings_translations (ui_strings_id, languages_code, value)
 *
 * Idempotent en niet-destructief:
 *   - `ui_strings`-rij ontbreekt        -> aangemaakt
 *   - EN-vertaling ontbreekt/is leeg    -> aangemaakt
 *   - EN-vertaling bestaat al met waarde-> overgeslagen (nooit overschreven,
 *     tenzij --force; content-writer-edits in Directus winnen dus altijd)
 *
 * Gebruik:
 *   DIRECTUS_URL=http://vinomartino-directus-1:8055 DIRECTUS_TOKEN=<token> \
 *     node directus/scripts/seed-ui-strings-en.mjs directus/data/ui-strings-en-lat2771.json
 *
 * Vlaggen:
 *   --dry-run   toon wat er zou gebeuren, schrijf niets
 *   --force     overschrijf ook bestaande, niet-lege EN-waarden
 *   --locale=xx andere doeltaal dan `en`
 */

import { readFile } from 'node:fs/promises';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/+$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const locale = (args.find((a) => a.startsWith('--locale=')) || '--locale=en').split('=')[1];
const dataPath = args.find((a) => !a.startsWith('--'));

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}
if (!dataPath) {
  console.error('Usage: node directus/scripts/seed-ui-strings-en.mjs <data.json> [--dry-run] [--force] [--locale=en]');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(path, init = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** key -> { id, translations: [{ id, languages_code, value }] } voor de hele collectie. */
async function loadExisting() {
  const json = await api('/items/ui_strings?limit=-1&fields=id,key,translations.id,translations.languages_code,translations.value');
  const map = new Map();
  for (const row of json.data ?? []) {
    if (row.key) map.set(String(row.key), row);
  }
  return map;
}

const raw = JSON.parse(await readFile(dataPath, 'utf8'));
// `_`-prefixed sleutels zijn commentaar in het databestand, geen ui_strings-key.
const entries = Object.entries(raw).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string');

const existing = await loadExisting();
console.log(`[seed-ui-strings] ${entries.length} keys in ${dataPath}; ${existing.size} ui_strings-rijen in Directus; locale=${locale}${dryRun ? ' (dry-run)' : ''}`);

let createdKeys = 0;
let createdTranslations = 0;
let updatedTranslations = 0;
let skipped = 0;
const errors = [];

for (const [key, value] of entries) {
  try {
    let row = existing.get(key);

    if (!row) {
      if (dryRun) {
        console.log(`  + key      ${key}`);
      } else {
        const created = await api('/items/ui_strings', { method: 'POST', body: JSON.stringify({ key }) });
        row = { id: created.data.id, key, translations: [] };
        existing.set(key, row);
      }
      createdKeys += 1;
      if (dryRun) {
        // Zonder rij is er per definitie ook geen vertaling.
        console.log(`  + ${locale.padEnd(2)} ${key} = ${JSON.stringify(value).slice(0, 70)}`);
        createdTranslations += 1;
        continue;
      }
    }

    const translations = Array.isArray(row.translations) ? row.translations : [];
    const current = translations.find((t) => String(t.languages_code) === locale);

    if (current && String(current.value ?? '').trim() !== '' && !force) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  ${current ? '~' : '+'} ${locale.padEnd(2)} ${key} = ${JSON.stringify(value).slice(0, 70)}`);
      if (current) updatedTranslations += 1;
      else createdTranslations += 1;
      continue;
    }

    if (current) {
      await api(`/items/ui_strings_translations/${current.id}`, { method: 'PATCH', body: JSON.stringify({ value }) });
      updatedTranslations += 1;
    } else {
      await api('/items/ui_strings_translations', {
        method: 'POST',
        body: JSON.stringify({ ui_strings_id: row.id, languages_code: locale, value }),
      });
      createdTranslations += 1;
    }
  } catch (err) {
    errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(
  `[seed-ui-strings] keys_created=${createdKeys} translations_created=${createdTranslations} ` +
    `translations_updated=${updatedTranslations} skipped=${skipped} errors=${errors.length}`,
);
for (const e of errors) console.error(`  ! ${e}`);
process.exit(errors.length ? 1 : 0);
