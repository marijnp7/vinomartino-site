#!/usr/bin/env node
/**
 * Seed the header navigation items into Directus.
 *
 * LAT-1032: this list is now AUTHORITATIVE. It matches the curated topnav set
 * (was hardcoded onder LAT-1591) exactly, zodat het CMS-gedreven pad in
 * src/lib/navigation.ts identiek rendert aan de vorige hardcoded nav — geen
 * regressie. Landen/Streken/Wijnroutes zijn BEWUST geen nav-tabs (die leven in
 * de /ontdek-atlas-hub); oude rijen met die keys worden gesnoeid.
 *
 * Idempotent: upsert by `key`, insert if missing, en prune elke nav_items-rij
 * met een key die niet in deze lijst staat.
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
  { key: 'ontdek', label: 'Ontdek', href: '/ontdek/', order: 5 },
  { key: 'wijnhuizen', label: 'Wijnhuizen', href: '/wijnhuizen/', order: 30 },
  { key: 'accommodaties', label: 'Overnachten', href: '/accommodaties/', order: 35 },
  { key: 'artikelen', label: 'Artikelen', href: '/artikelen/', order: 50 },
  { key: 'de-brief', label: 'De brief', href: '/de-brief/', order: 60 },
  { key: 'over-ons', label: 'Ons verhaal', href: '/over-ons/', order: 70 },
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

async function prune() {
  const keep = new Set(items.map((i) => i.key));
  const res = await fetch(`${DIRECTUS_URL}/items/nav_items?fields=id,key&limit=-1`, { headers });
  if (!res.ok) throw new Error(`prune list: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const stale = (json.data || []).filter((r) => !keep.has(r.key));
  for (const row of stale) {
    const del = await fetch(`${DIRECTUS_URL}/items/nav_items/${row.id}`, { method: 'DELETE', headers });
    if (!del.ok) throw new Error(`delete ${row.key}: ${del.status} ${await del.text()}`);
    console.log(`  ✕ pruned ${row.key}`);
  }
}

async function run() {
  console.log(`\nSeeding ${items.length} nav_items into ${DIRECTUS_URL}\n`);
  for (const item of items) await upsert(item);
  await prune();
  console.log('\n✅ Navigation seed complete.\n');
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
