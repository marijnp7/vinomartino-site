#!/usr/bin/env node
/**
 * LAT-962 — Hide legacy travel-collections in Directus.
 *
 * Sets meta.hidden = true on the 10 generic travel-collections that are
 * unused by the VinoMartino codebase, so the editor sidebar only shows the
 * wine-specific collections (articles, landen, streken, wijnhuizen, routes).
 *
 * Soft-hide via meta-flag — no data loss, no schema change, fully reversible
 * (PATCH meta.hidden=false on each collection).
 *
 * Usage:
 *   set -a; source /root/vinomartino-site/.env; set +a
 *   DRY_RUN=1 node directus/scripts/hide-legacy-collections.mjs   # preview
 *   node directus/scripts/hide-legacy-collections.mjs             # apply
 *
 * Env: DIRECTUS_URL, DIRECTUS_TOKEN (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required. Set it as an environment variable.');
  process.exit(1);
}

const LEGACY_COLLECTIONS = [
  'countries',
  'regions',
  'destinations',
  'itineraries',
  'themes',
  'attractions',
  'accommodations',
  'activities',
  'food_spots',
  'transport_routes',
];

// Defensive allowlist: these are the wine-specific collections that MUST stay
// visible. The script refuses to hide any of these even if accidentally added
// to LEGACY_COLLECTIONS.
const PROTECTED_COLLECTIONS = new Set([
  'articles',
  'landen',
  'streken',
  'wijnhuizen',
  'routes',
]);

const headers = {
  'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getCollection(name) {
  try {
    const res = await api('GET', `/collections/${name}`);
    return res?.data ?? null;
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('FORBIDDEN')) return null;
    throw e;
  }
}

async function getRowCount(name) {
  try {
    const res = await api('GET', `/items/${name}?aggregate[count]=*&limit=0`);
    const count = res?.data?.[0]?.count;
    if (typeof count === 'string') return Number.parseInt(count, 10);
    if (typeof count === 'number') return count;
    return null;
  } catch {
    return null;
  }
}

async function run() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`\n[LAT-962] hide-legacy-collections — mode=${mode}`);
  console.log(`Directus: ${DIRECTUS_URL}\n`);

  // Defensive: ensure no protected collection is in the target set.
  const protectedHits = LEGACY_COLLECTIONS.filter((c) => PROTECTED_COLLECTIONS.has(c));
  if (protectedHits.length > 0) {
    console.error(`Refusing to run: protected collection(s) in target list: ${protectedHits.join(', ')}`);
    process.exit(2);
  }

  let alreadyHidden = 0;
  let willHide = 0;
  let missing = 0;

  for (const name of LEGACY_COLLECTIONS) {
    const col = await getCollection(name);
    if (!col) {
      console.log(`  – ${name.padEnd(20)} (not found, skipping)`);
      missing += 1;
      continue;
    }
    const currentlyHidden = Boolean(col?.meta?.hidden);
    const rows = await getRowCount(name);
    const rowLabel = rows === null ? 'rows=?' : `rows=${rows}`;

    if (currentlyHidden) {
      console.log(`  = ${name.padEnd(20)} already hidden (${rowLabel})`);
      alreadyHidden += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  + ${name.padEnd(20)} would hide (${rowLabel})`);
      willHide += 1;
      continue;
    }

    await api('PATCH', `/collections/${name}`, { meta: { hidden: true } });
    console.log(`  ✓ ${name.padEnd(20)} hidden (${rowLabel})`);
    willHide += 1;
  }

  console.log('');
  console.log(`Summary: ${willHide} ${DRY_RUN ? 'will-hide' : 'hidden'} · ${alreadyHidden} already-hidden · ${missing} missing · ${LEGACY_COLLECTIONS.length} total`);
  if (DRY_RUN) {
    console.log('\nDry-run only. Re-run without DRY_RUN=1 to apply.\n');
  } else {
    console.log('\nDone. Editor sidebar should now show only the wine collections + articles.\n');
  }
}

run().catch((err) => {
  console.error('hide-legacy-collections failed:', err.message);
  process.exit(1);
});
