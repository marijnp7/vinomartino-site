#!/usr/bin/env node
/**
 * Seed 7 header navigation items into Directus (LAT-907).
 * Idempotent: looks up existing rows by `key` and updates them; inserts only if missing.
 *
 * Run after bootstrap-schema.mjs:
 *   DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<token> \
 *     node directus/scripts/seed-navigation.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

const items = [
  { key: 'landen', label: 'Landen', href: '/landen/', order: 10 },
  { key: 'streken', label: 'Streken', href: '/streken/', order: 20 },
  { key: 'reizen', label: 'Reizen', href: '/reizen-nareizen/', order: 25 },
  { key: 'wijnhuizen', label: 'Wijnhuizen', href: '/wijnhuizen/', order: 30 },
  { key: 'wijnroutes', label: 'Wijnroutes', href: '/wijnroutes/', order: 40 },
  { key: 'artikelen', label: 'Artikelen', href: '/artikelen/', order: 50 },
  { key: 'de-brief', label: 'De Brief', href: '/de-brief/', order: 60 },
  { key: 'over-ons', label: 'Over ons', href: '/over-ons/', order: 70 },
];

async function findByKey(key) {
  const url = `${DIRECTUS_URL}/items/nav_items?filter[key][_eq]=${encodeURIComponent(key)}&fields=id,key&limit=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`lookup ${key}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data?.[0] || null;
}

async function upsert(item) {
  const existing = await findByKey(item.key);
  const payload = { ...item, status: 'published' };
  if (existing) {
    const res = await fetch(`${DIRECTUS_URL}/items/nav_items/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`update ${item.key}: ${res.status} ${await res.text()}`);
    console.log(`  ↻ updated ${item.key}`);
  } else {
    const res = await fetch(`${DIRECTUS_URL}/items/nav_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`insert ${item.key}: ${res.status} ${await res.text()}`);
    console.log(`  + inserted ${item.key}`);
  }
}

async function run() {
  console.log(`\nSeeding ${items.length} nav_items into ${DIRECTUS_URL}\n`);
  for (const item of items) await upsert(item);
  console.log('\n✅ Navigation seed complete.\n');
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
