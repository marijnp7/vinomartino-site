#!/usr/bin/env node
/**
 * LAT-1619: artikel→artikel cross-link schema.
 *
 * Voegt twee zelf-referentiële M2M-relaties toe op de `articles`-collectie zodat
 * de redactie per artikel handmatig gerelateerde stukken kan koppelen:
 *
 *   1. articles.related_articles  → rechterzijbalk "Gerelateerde stukken" (max 3)
 *   2. articles.meer_over         → voetblok "Meer over [druif/regio]" (max 3)
 *
 * Beide zijn articles ↔ articles M2M via een eigen junction-collectie. De Astro
 * loader (src/lib/articles.ts) leest exact:
 *     related_articles.related_articles_id.{slug,title}
 *     meer_over.related_articles_id.{slug,title}
 * Houd de FK-naam `related_articles_id` in beide junctions identiek, anders
 * no-opt de cross-link silently.
 *
 * Idempotent: 409 / "already exists" wordt overgeslagen. Tot dit draait
 * degradeert de loader graceful (tiered fallback) en bouwt de site zonder de
 * artikel-cross-links.
 *
 * Vergeet niet na afloop de build-rol read-permissie te geven op de nieuwe
 * velden + junction-collecties (zie mirror-articles-read-permissions.mjs).
 *
 * Run:
 *   DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *   DIRECTUS_TOKEN=<admin-token> \
 *   node directus/scripts/add-related-articles-fields.mjs
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
  if (res.status === 409 || /already exists/i.test(text) || /exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

async function ensureCollection(collection, meta) {
  process.stdout.write(`  + collection ${collection} ... `);
  const res = await api('POST', '/collections', {
    collection,
    meta: { hidden: true, icon: 'link', ...meta },
    schema: {},
  });
  if (res.alreadyExists) { console.log('already exists, skipping'); return 'skipped'; }
  if (res.ok) { console.log('OK'); return 'created'; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return 'error';
}

async function ensureField(collection, field) {
  process.stdout.write(`  + ${collection}.${field.field} ... `);
  const res = await api('POST', `/fields/${collection}`, field);
  if (res.alreadyExists) { console.log('already exists, skipping'); return 'skipped'; }
  if (res.ok) { console.log('OK'); return 'created'; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return 'error';
}

async function ensureRelation(relation) {
  const label = `${relation.collection}.${relation.field} → ${relation.related_collection}`;
  process.stdout.write(`  ~ relation ${label} ... `);
  const res = await api('POST', '/relations', relation);
  if (res.alreadyExists) { console.log('already exists, skipping'); return 'skipped'; }
  if (res.ok) { console.log('OK'); return 'created'; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return 'error';
}

/**
 * Wire one self-referential M2M: articles.<aliasField> ↔ articles via <junction>.
 * FK naar de doel-article heet altijd `related_articles_id` (loader-contract).
 */
async function ensureSelfM2M(summary, aliasField, junction, note) {
  // 1. Alias-veld op articles (de redactionele invoer, gecapt op 3 in de UI).
  summary[`articles.${aliasField}`] = await ensureField('articles', {
    field: aliasField,
    type: 'alias',
    meta: {
      interface: 'list-m2m',
      special: ['m2m'],
      width: 'full',
      note,
      options: { template: '{{related_articles_id.title}}', limit: 3 },
    },
    schema: null,
  });

  // 2. Junction-collectie + FK-velden + sort.
  summary[junction] = await ensureCollection(junction, { note: `M2M: articles ↔ articles (${aliasField})` });
  summary[`${junction}.articles_id`] = await ensureField(junction, {
    field: 'articles_id', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true },
  });
  summary[`${junction}.related_articles_id`] = await ensureField(junction, {
    field: 'related_articles_id', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true },
  });
  summary[`${junction}.sort`] = await ensureField(junction, {
    field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: { is_nullable: true },
  });

  // 3. Relaties: owner-FK draagt one_field + junction_field zodat Directus de
  //    M2M correct exposeert; target-FK wijst terug met junction_field.
  summary[`${junction}.articles_id.rel`] = await ensureRelation({
    collection: junction,
    field: 'articles_id',
    related_collection: 'articles',
    meta: { one_field: aliasField, junction_field: 'related_articles_id', sort_field: 'sort' },
    schema: { on_delete: 'CASCADE' },
  });
  summary[`${junction}.related_articles_id.rel`] = await ensureRelation({
    collection: junction,
    field: 'related_articles_id',
    related_collection: 'articles',
    meta: { junction_field: 'articles_id' },
    schema: { on_delete: 'CASCADE' },
  });
}

async function run() {
  console.log(`\nLAT-1619 migration: artikel cross-link M2M → ${DIRECTUS_URL}\n`);
  const summary = {};
  await ensureSelfM2M(
    summary,
    'related_articles',
    'articles_related',
    'Rechterzijbalk "Gerelateerde stukken" — kies max 3 gerelateerde artikelen (LAT-1619).',
  );
  await ensureSelfM2M(
    summary,
    'meer_over',
    'articles_meer_over',
    'Voetblok "Meer over [druif/regio]" — kies max 3 artikel-cards (LAT-1619).',
  );
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
  if (Object.values(summary).includes('error')) process.exit(1);
  console.log('\nNB: geef de build-rol read-permissie op related_articles, meer_over en beide junction-collecties.');
}

run().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
