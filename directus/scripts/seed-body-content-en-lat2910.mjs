#!/usr/bin/env node
/**
 * LAT-2912 deel 1b — seed EN `cta_blocks`/`tags` overlays op routes_translations
 * en articles_translations (schema live sinds LAT-2921).
 *
 * Bron: directus/data/body-content-en-lat2910.json. Elke leestekst-leaf staat
 * daar als `{nl, en}`-paar; dit script projecteert dat naar een pure EN-overlay
 * (alleen de `en`-waarde, zelfde vorm als de NL-basis) en PATCHt/CREATEt de
 * bijbehorende `<parent>_translations`-rij. Bij het schrijven wordt NIET
 * overschreven wat al in de rij staat (title/body/meta_* etc. blijven intact —
 * er wordt alleen het/de opgegeven veld(en) meegestuurd) en een leeg cta_blocks/
 * tags-veld wordt nooit overschreven tenzij --force.
 *
 * Validatie (verplicht door de `_mapping_confidence`-noot in de databron): vóór
 * het schrijven wordt de array-vorm (aantal `options`, aantal `tags`) van de
 * overlay vergeleken met de live NL-basis. Bij een mismatch wordt dat veld
 * overgeslagen als fout i.p.v. blind weggeschreven — een verkeerde volgorde in
 * de bron zou anders geruisloos copy aan de verkeerde CTA/tag koppelen.
 *
 * Contract (zie src/lib/directus-i18n.ts mergeTranslatedValue): arrays mergen
 * element-gewijs over de NL-basis-lengte, objecten key-gewijs. Vandaar dat de
 * overlay dezelfde structuur/volgorde als de NL-basis moet hebben.
 *
 * Gebruik:
 *   DIRECTUS_URL=http://vinomartino-directus-1:8055 DIRECTUS_TOKEN=<token> \
 *     node directus/scripts/seed-body-content-en-lat2910.mjs
 *   node directus/scripts/seed-body-content-en-lat2910.mjs --dry-run
 *   node directus/scripts/seed-body-content-en-lat2910.mjs directus/data/body-content-en-lat2910.json
 *
 * Vlaggen:
 *   --dry-run   toon wat er zou gebeuren, schrijf niets
 *   --force     overschrijf ook al-gevulde cta_blocks/tags-waarden
 */

import { readFile } from 'node:fs/promises';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/+$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const dataPath = args.find((a) => !a.startsWith('--')) || 'directus/data/body-content-en-lat2910.json';

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
  // `redirect: 'manual'` zodat een CF-Access-302 hier zichtbaar blijft als 302
  // i.p.v. stilletjes de HTML-loginpagina te volgen (zelfde patroon als
  // seed-ui-strings-en.mjs, LAT-2912).
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

/** `{nl, en}`-leaf -> de EN-string; recurseert door arrays/objecten heen. */
function extractEn(node) {
  if (Array.isArray(node)) return node.map(extractEn);
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (
      keys.length === 2 &&
      keys.includes('nl') &&
      keys.includes('en') &&
      typeof node.en === 'string' &&
      typeof node.nl === 'string'
    ) {
      return node.en;
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = extractEn(v);
    return out;
  }
  return node;
}

/** Vergelijkt array-lengtes/object-vorm van de overlay tegen de live NL-basis. */
function structuralMismatch(base, overlay, path) {
  if (Array.isArray(overlay)) {
    if (!Array.isArray(base)) return `${path}: overlay is array, live NL-basis is dat niet`;
    if (base.length !== overlay.length) {
      return `${path}: lengte-mismatch (live NL=${base.length}, overlay=${overlay.length})`;
    }
    for (let i = 0; i < overlay.length; i++) {
      const m = structuralMismatch(base[i], overlay[i], `${path}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (overlay && typeof overlay === 'object') {
    if (!base || typeof base !== 'object' || Array.isArray(base)) {
      return `${path}: overlay is object, live NL-basis is ${Array.isArray(base) ? 'array' : typeof base}`;
    }
    for (const k of Object.keys(overlay)) {
      const m = structuralMismatch(base[k], overlay[k], `${path}.${k}`);
      if (m) return m;
    }
    return null;
  }
  return null;
}

function isEmptyValue(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

// Databestand-sleutels die niet 1-op-1 een Directus-veldnaam zijn:
//   `tags_en` -> Directus-veld `tags`. Al de kant-en-klare EN-array (index-
//   gelijk aan de live NL-basis, zie `_array_index_warning` in het
//   databestand) — GEEN {nl,en}-paren, dus geen extractEn() nodig.
//   `tags_nl_base` is puur documentatie (de live NL-basis ter referentie),
//   geen schrijf-target.
const FIELD_ALIASES = { tags_en: 'tags' };
const METADATA_KEYS = new Set(['tags_nl_base']);

const raw = JSON.parse(await readFile(dataPath, 'utf8'));
const PARENTS = ['routes', 'articles'];

console.log(`[seed-body-content] bron=${dataPath} directus=${DIRECTUS_URL}${dryRun ? ' (dry-run)' : ''}`);

let written = 0;
let skipped = 0;
const errors = [];

for (const parent of PARENTS) {
  const group = raw[parent];
  if (!group) continue;

  for (const [slug, entry] of Object.entries(group)) {
    const rawKeys = Object.keys(entry).filter((k) => !k.startsWith('_') && !METADATA_KEYS.has(k));
    if (rawKeys.length === 0) {
      // bv. langhe-piemonte-4-dagen-route: alleen `_note`, al gedaan via ui_strings (LAT-2868).
      continue;
    }
    const targetFields = rawKeys.map((k) => FIELD_ALIASES[k] || k);

    try {
      const fields = [
        'id',
        'slug',
        'translations.id',
        'translations.languages_code',
        ...targetFields,
        ...targetFields.map((f) => `translations.${f}`),
      ].join(',');
      const json = await api(
        `/items/${parent}?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=${fields}&limit=1`,
      );
      const item = (json?.data ?? [])[0];
      if (!item) {
        errors.push(`${parent}/${slug}: geen live item gevonden`);
        continue;
      }

      const translations = Array.isArray(item.translations) ? item.translations : [];
      const enRow = translations.find((t) => String(t.languages_code) === 'en');

      const overlay = {};
      for (const rawKey of rawKeys) {
        const field = FIELD_ALIASES[rawKey] || rawKey;
        // `tags_en` is al de kant-en-klare EN-array; alleen `cta_blocks` (en
        // toekomstige {nl,en}-paar-velden) hebben de extractEn()-projectie nodig.
        const enValue = rawKey === field ? extractEn(entry[rawKey]) : entry[rawKey];
        const currentOverlay = enRow ? enRow[field] : undefined;

        if (!isEmptyValue(currentOverlay) && !force) {
          console.log(`  ↳ ${parent}/${slug}.${field}: al gevuld, overslaan`);
          skipped += 1;
          continue;
        }

        const mismatch = structuralMismatch(item[field], enValue, `${parent}/${slug}.${field}`);
        if (mismatch) {
          errors.push(`structurele mismatch vs live NL — ${mismatch}`);
          continue;
        }

        overlay[field] = enValue;
      }

      if (Object.keys(overlay).length === 0) continue;

      if (dryRun) {
        console.log(
          `  + ${parent}/${slug}: zou ${enRow ? 'PATCH' : 'CREATE'} translations.{${Object.keys(overlay).join(', ')}}`,
        );
        written += 1;
        continue;
      }

      if (enRow) {
        await api(`/items/${parent}_translations/${enRow.id}`, {
          method: 'PATCH',
          body: JSON.stringify(overlay),
        });
      } else {
        await api(`/items/${parent}_translations`, {
          method: 'POST',
          body: JSON.stringify({ [`${parent}_id`]: item.id, languages_code: 'en', ...overlay }),
        });
      }
      console.log(`  ✓ ${parent}/${slug}: geschreven translations.{${Object.keys(overlay).join(', ')}}`);
      written += 1;
    } catch (err) {
      errors.push(`${parent}/${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

console.log(`[seed-body-content] written=${written} skipped=${skipped} errors=${errors.length}`);
for (const e of errors) console.error(`  ! ${e}`);
process.exit(errors.length ? 1 : 0);
