#!/usr/bin/env node
/**
 * LAT-1008: SEO-meta schema extension.
 *
 * Idempotently adds three Directus fields used by the Astro SEO foundation
 * (LAT-985), with graceful skip on 409 / "already exists":
 *
 *   1. landen.og_image          (uuid, file-image)            — dedicated 1200x630 social card
 *   2. landen.wijnstreken       (alias o2m → streken.land_id) — drives JSON-LD hasPart
 *   3. articles.updated_at      (timestamp)                   — article:modified_time + dateModified
 *
 * Until these exist, Astro falls back to:
 *   - hero_image for og:image
 *   - showcase/pageData-derived streken[] for land JSON-LD
 *   - pub_date for article:modified_time
 *
 * Run:
 *   DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *   DIRECTUS_TOKEN=<admin-token> \
 *   node directus/scripts/add-seo-meta-fields.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 200 || res.status === 204) return { ok: true, status: res.status, text };
  if (res.status === 409 || /already exists/i.test(text) || /Field.*exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

async function ensureField(collection, field) {
  process.stdout.write(`  + ${collection}.${field.field} ... `);
  const res = await api('POST', `/fields/${collection}`, field);
  if (res.alreadyExists) { console.log('already exists, skipping'); return 'skipped'; }
  if (res.ok) { console.log('OK'); return 'created'; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return 'error';
}

async function ensureRelationMeta(collection, field, patch) {
  // The base relation (streken.land_id → landen) is created by bootstrap-schema.mjs.
  // This call only adds `one_field: 'wijnstreken'` so Directus exposes the reverse alias.
  process.stdout.write(`  ~ relation ${collection}.${field} one_field ... `);
  const res = await api('PATCH', `/relations/${collection}/${field}`, patch);
  if (res.ok) { console.log('OK'); return 'updated'; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return 'error';
}

const ogImageField = {
  field: 'og_image',
  type: 'uuid',
  meta: {
    interface: 'file-image',
    width: 'full',
    note: 'Optional Open Graph image (1200x630). Falls back to hero_image when empty.',
  },
  schema: { is_nullable: true },
};

const wijnstrekenAliasField = {
  field: 'wijnstreken',
  type: 'alias',
  meta: {
    interface: 'list-o2m',
    special: ['o2m'],
    width: 'full',
    note: 'Reverse relation: streken whose land_id points to this land. Drives JSON-LD hasPart.',
    options: { template: '{{name}}' },
  },
  schema: null,
};

const articleUpdatedAtField = {
  field: 'updated_at',
  type: 'timestamp',
  meta: {
    interface: 'datetime',
    width: 'half',
    note: 'Last meaningful editorial update. Drives article:modified_time and JSON-LD dateModified.',
  },
  schema: { is_nullable: true },
};

async function run() {
  console.log(`\nLAT-1008 migration: SEO-meta fields → ${DIRECTUS_URL}\n`);
  const summary = {};
  summary['landen.og_image'] = await ensureField('landen', ogImageField);
  summary['landen.wijnstreken'] = await ensureField('landen', wijnstrekenAliasField);
  summary['streken.land_id.one_field'] = await ensureRelationMeta('streken', 'land_id', {
    meta: { one_field: 'wijnstreken' },
  });
  summary['articles.updated_at'] = await ensureField('articles', articleUpdatedAtField);
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
  if (Object.values(summary).includes('error')) process.exit(1);
}

run().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
