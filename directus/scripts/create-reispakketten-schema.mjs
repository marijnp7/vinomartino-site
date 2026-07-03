#!/usr/bin/env node
/**
 * Create the `reispakketten` collection + M2M junctions for the "Reizen nareizen"
 * pakketpagina's (LAT-2023). New content-type — did not exist before.
 *
 * Builds (idempotent — 409 / "already exists" are treated as no-ops so re-runs
 * on a bootstrapped schema are safe):
 *
 *   Collection `reispakketten`
 *     slug (string, unique), titel (string), tagline (string), status
 *     (published/draft, default draft — publish-gate), pub_date (date),
 *     introductie (markdown), dag_tot_dag (markdown), reismoment (text),
 *     cta_heading (string), cta_tekst (text), meta_title (string),
 *     meta_description (text), hero_image (file → directus_files),
 *     streek_id (M2O → streken)
 *
 *   M2M reispakketten ↔ wijnhuizen  (junction `reispakketten_wijnhuizen`)
 *     alias field `wijnhuizen` on reispakketten (list-m2m)
 *   M2M reispakketten ↔ accommodations (junction `reispakketten_accommodations`)
 *     alias field `accommodaties` on reispakketten (list-m2m)
 *
 * The site loader (src/lib/reispakketten.ts) reads the M2M via the alias fields
 * `wijnhuizen.wijnhuizen_id.*` and `accommodaties.accommodations_id.*`, so the
 * alias fields + one_field relations below are required for the build query.
 *
 * Usage (from VPS, with an admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a   # for DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/create-reispakketten-schema.mjs
 *
 * Pass `--dry-run` to print what would be created without writing.
 *
 * After running: grant the build/read role read-permission on `reispakketten`,
 * `reispakketten_wijnhuizen` and `reispakketten_accommodations` (mirror the
 * existing read-perms on `routes` / `routes_wijnhuizen`), otherwise the site
 * build gets 403 and skips the pages.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (must be an admin token).');
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${method} ${path}`);
    return null;
  }
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: AUTH,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function isAlreadyExists(e) {
  const m = e.message;
  return m.includes('already exists')
    || m.includes('409')
    || m.includes('already has an associated relationship');
}

async function createCollection(collection, meta = {}) {
  console.log(`Collection: ${collection}`);
  try {
    await api('POST', '/collections', {
      collection,
      meta: { icon: meta.icon || 'box', note: meta.note || '', hidden: meta.hidden || false },
      schema: {},
    });
  } catch (e) {
    if (isAlreadyExists(e)) console.log('  ↳ already exists');
    else throw e;
  }
}

async function createField(collection, field) {
  console.log(`  + ${collection}.${field.field}`);
  try {
    await api('POST', `/fields/${collection}`, field);
  } catch (e) {
    if (isAlreadyExists(e)) console.log('    ↳ already exists');
    else throw e;
  }
}

async function createRelation(relation) {
  console.log(`  ~ relation ${relation.collection}.${relation.field} → ${relation.related_collection}`);
  try {
    await api('POST', '/relations', relation);
  } catch (e) {
    if (isAlreadyExists(e)) console.log('    ↳ already exists');
    else throw e;
  }
}

const textField = (field, opts = {}) => ({
  field,
  type: 'string',
  meta: { interface: 'input', width: opts.width || 'full', note: opts.note || '' },
  schema: { is_nullable: opts.nullable !== false, is_unique: Boolean(opts.unique) },
});

const textAreaField = (field, note = '') => ({
  field,
  type: 'text',
  meta: { interface: 'input-multiline', width: 'full', note },
  schema: { is_nullable: true },
});

const markdownField = (field, note = '') => ({
  field,
  type: 'text',
  meta: { interface: 'input-rich-text-md', width: 'full', note },
  schema: { is_nullable: true },
});

async function run() {
  console.log(`\nreispakketten schema → ${DIRECTUS_URL}${DRY_RUN ? '  (dry-run)' : ''}\n`);

  // ── reispakketten ──────────────────────────────────────
  await createCollection('reispakketten', {
    icon: 'card_travel',
    note: 'Reizen nareizen — boekbare reispakketten per wijnstreek (LAT-2023)',
  });
  for (const f of [
    textField('titel', { nullable: false, note: 'Weergavetitel, bv. "Vier dagen Langhe"' }),
    textField('slug', { nullable: false, unique: true, note: 'URL-slug, bv. langhe-piemonte' }),
    textField('tagline', { note: 'Korte ondertitel onder de H1' }),
    {
      field: 'status',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: { choices: [
          { text: 'Published', value: 'published' },
          { text: 'Draft', value: 'draft' },
        ] },
        default_value: 'draft',
        note: 'Publish-gate: alleen published rendert in prod',
      },
      schema: { default_value: 'draft' },
    },
    {
      field: 'pub_date',
      type: 'date',
      meta: { interface: 'datetime', width: 'half', note: 'Publicatiedatum' },
      schema: { is_nullable: true },
    },
    { field: 'streek_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half', note: 'Wijnstreek (M2O → streken)' }, schema: { is_nullable: true } },
    markdownField('introductie', 'Inleiding (markdown)'),
    markdownField('dag_tot_dag', 'Dag-tot-dag route (markdown)'),
    textAreaField('reismoment', 'Beste reismoment / seizoensnotitie'),
    textField('cta_heading', { note: 'CTA-koptekst' }),
    textAreaField('cta_tekst', 'CTA-body'),
    textField('meta_title', { note: 'SEO title override' }),
    textAreaField('meta_description', 'SEO meta description'),
    {
      field: 'hero_image',
      type: 'uuid',
      meta: { interface: 'file-image', width: 'full', note: 'Hero-afbeelding (Directus file)' },
      schema: { is_nullable: true },
    },
  ]) await createField('reispakketten', f);

  await createRelation({ collection: 'reispakketten', field: 'streek_id', related_collection: 'streken' });
  await createRelation({
    collection: 'reispakketten',
    field: 'hero_image',
    related_collection: 'directus_files',
  });

  // ── M2M reispakketten ↔ wijnhuizen ─────────────────────
  await createCollection('reispakketten_wijnhuizen', { icon: 'link', note: 'M2M: reispakketten ↔ wijnhuizen', hidden: true });
  await createField('reispakketten_wijnhuizen', { field: 'reispakketten_id', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true } });
  await createField('reispakketten_wijnhuizen', { field: 'wijnhuizen_id', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true } });
  await createField('reispakketten_wijnhuizen', { field: 'sort_order', type: 'integer', meta: { interface: 'input', width: 'half' }, schema: { is_nullable: true, default_value: 0 } });
  // Alias field on the parent so the M2M is editable in admin + queryable via `wijnhuizen.wijnhuizen_id.*`.
  await createField('reispakketten', {
    field: 'wijnhuizen',
    type: 'alias',
    meta: { interface: 'list-m2m', special: ['m2m'], width: 'full', note: 'Te boeken wijnhuizen (M2M)', options: { template: '{{wijnhuizen_id.name}}' } },
    schema: null,
  });
  await createRelation({ collection: 'reispakketten_wijnhuizen', field: 'reispakketten_id', related_collection: 'reispakketten', meta: { one_field: 'wijnhuizen', junction_field: 'wijnhuizen_id' } });
  await createRelation({ collection: 'reispakketten_wijnhuizen', field: 'wijnhuizen_id', related_collection: 'wijnhuizen', meta: { junction_field: 'reispakketten_id' } });

  // ── M2M reispakketten ↔ accommodations ─────────────────
  await createCollection('reispakketten_accommodations', { icon: 'link', note: 'M2M: reispakketten ↔ accommodations', hidden: true });
  await createField('reispakketten_accommodations', { field: 'reispakketten_id', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true } });
  await createField('reispakketten_accommodations', { field: 'accommodations_id', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true } });
  await createField('reispakketten_accommodations', { field: 'sort_order', type: 'integer', meta: { interface: 'input', width: 'half' }, schema: { is_nullable: true, default_value: 0 } });
  await createField('reispakketten', {
    field: 'accommodaties',
    type: 'alias',
    meta: { interface: 'list-m2m', special: ['m2m'], width: 'full', note: 'Accommodaties (M2M)', options: { template: '{{accommodations_id.name}}' } },
    schema: null,
  });
  await createRelation({ collection: 'reispakketten_accommodations', field: 'reispakketten_id', related_collection: 'reispakketten', meta: { one_field: 'accommodaties', junction_field: 'accommodations_id' } });
  await createRelation({ collection: 'reispakketten_accommodations', field: 'accommodations_id', related_collection: 'accommodations', meta: { junction_field: 'reispakketten_id' } });

  console.log('\n✅ reispakketten schema complete — 1 collection + 2 M2M junctions.\n');
  console.log('Vergeet niet: read-permissie voor de build-rol op reispakketten,');
  console.log('reispakketten_wijnhuizen en reispakketten_accommodations (mirror routes-perms).\n');
}

run().catch((err) => {
  console.error('Schema creation failed:', err.message);
  process.exit(1);
});
