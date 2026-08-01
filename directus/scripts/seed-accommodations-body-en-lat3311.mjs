#!/usr/bin/env node
/**
 * LAT-3311 — seed EN `description`/`why_regel` op `accommodations_translations`.
 *
 * Zelfde patroon als seed-body-content-en-lat2910.mjs, maar voor de
 * `accommodations`-collectie (niet routes/articles): elke `{nl, en}`-leaf in
 * directus/data/body-content-en-lat3311.json wordt geprojecteerd naar de
 * EN-waarde en PATCHt/CREATEt de bijbehorende `accommodations_translations`-rij
 * (languages_code=en). Bestaande, niet-lege EN-waarden worden nooit
 * overschreven tenzij --force.
 *
 * Matching: de databron kent de Directus `slug`/`id` van dit record niet (geen
 * DIRECTUS_TOKEN/CF_ACCESS in de omgeving waarin dit is voorbereid — zelfde
 * blocker als LAT-2912). Elke entry draagt daarom een `_match`-blok en dit
 * script matcht op `filter[name][_eq]`. Levert de query niet precies 1 record
 * op, dan slaat het script die entry over als fout i.p.v. blind op het
 * verkeerde record te schrijven.
 *
 * Validatie: de live NL-basis (`description`/`why_regel`) moet exact overeen-
 * komen met het `nl`-veld in de databron — anders is dit niet meer het record
 * waarvoor de vertaling is geschreven en wordt de entry overgeslagen als fout.
 *
 * Gebruik:
 *   DIRECTUS_URL=http://vinomartino-directus-1:8055 DIRECTUS_TOKEN=<token> \
 *     node directus/scripts/seed-accommodations-body-en-lat3311.mjs
 *   node directus/scripts/seed-accommodations-body-en-lat3311.mjs --dry-run
 *
 * Vlaggen:
 *   --dry-run   toon wat er zou gebeuren, schrijf niets
 *   --force     overschrijf ook al-gevulde EN-waarden
 */

import { readFile } from 'node:fs/promises';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/+$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const dataPath = args.find((a) => !a.startsWith('--')) || 'directus/data/body-content-en-lat3311.json';

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
  headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
  headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
}

async function api(path, init = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { ...init, headers, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location') || '';
    throw new Error(
      `${init.method || 'GET'} ${path}: ${res.status} redirect naar ${loc.slice(0, 120)} — ` +
        'ziet eruit als Cloudflare Access. Zet CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET, ' +
        'of draai tegen de interne Directus-URL.',
    );
  }
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function isEmptyValue(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

const raw = JSON.parse(await readFile(dataPath, 'utf8'));
const group = raw.accommodations || {};

console.log(`[seed-accommodations-body-en] bron=${dataPath} directus=${DIRECTUS_URL}${dryRun ? ' (dry-run)' : ''}`);

let written = 0;
let skipped = 0;
const errors = [];

for (const [key, entry] of Object.entries(group)) {
  const match = entry._match;
  const fieldKeys = Object.keys(entry).filter((k) => !k.startsWith('_'));
  if (!match || fieldKeys.length === 0) continue;

  try {
    const nameFilter = `filter[name][_eq]=${encodeURIComponent(match.name)}`;
    const fields = ['id', 'name', 'slug', 'translations.id', 'translations.languages_code', ...fieldKeys, ...fieldKeys.map((f) => `translations.${f}`)].join(',');
    const json = await api(`/items/accommodations?${nameFilter}&fields=${fields}&limit=2`);
    const items = json?.data ?? [];
    if (items.length !== 1) {
      errors.push(`${key}: verwacht 1 live record voor name="${match.name}", kreeg ${items.length}`);
      continue;
    }
    const item = items[0];

    const translations = Array.isArray(item.translations) ? item.translations : [];
    const enRow = translations.find((t) => String(t.languages_code) === 'en');

    const overlay = {};
    for (const field of fieldKeys) {
      const pair = entry[field];
      const liveNl = item[field] ?? '';
      if (String(liveNl).trim() !== String(pair.nl).trim()) {
        errors.push(`${key}.${field}: live NL wijkt af van de databron — niet schrijven (mogelijk verkeerd record of inmiddels bewerkt)`);
        continue;
      }
      const currentOverlay = enRow ? enRow[field] : undefined;
      if (!isEmptyValue(currentOverlay) && !force) {
        console.log(`  ↳ ${key}.${field}: al gevuld, overslaan`);
        skipped += 1;
        continue;
      }
      overlay[field] = pair.en;
    }

    if (Object.keys(overlay).length === 0) continue;

    if (dryRun) {
      console.log(`  + ${key} (id=${item.id}): zou ${enRow ? 'PATCH' : 'CREATE'} translations.{${Object.keys(overlay).join(', ')}}`);
      written += 1;
      continue;
    }

    if (enRow) {
      await api(`/items/accommodations_translations/${enRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify(overlay),
      });
    } else {
      await api('/items/accommodations_translations', {
        method: 'POST',
        body: JSON.stringify({ accommodations_id: item.id, languages_code: 'en', ...overlay }),
      });
    }
    console.log(`  ✓ ${key} (id=${item.id}): geschreven translations.{${Object.keys(overlay).join(', ')}}`);
    written += 1;
  } catch (err) {
    errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`[seed-accommodations-body-en] written=${written} skipped=${skipped} errors=${errors.length}`);
for (const e of errors) console.error(`  ! ${e}`);
process.exit(errors.length ? 1 : 0);
