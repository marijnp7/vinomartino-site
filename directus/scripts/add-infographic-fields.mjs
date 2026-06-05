#!/usr/bin/env node
/**
 * LAT-1120 — landen-infographic schema-uitbreiding.
 *
 * Voegt de CMS-driven kaartdata toe voor de interactieve landen-infographic
 * (LAT-1119 / InfographicAtlas, LAT-1122). Mapt 1:1 op de renderer-contract in
 * src/components/InfographicAtlas.astro: SVG-path `d`-strings in een gedeelde
 * land-viewBox, zone-color uit de accent-enum burgundy|rust|vine.
 *
 * Idempotent: 409 / "already exists" / "already has an associated relationship"
 * worden als no-op behandeld, net als bootstrap-schema.mjs.
 *
 * Run (DevOps, na CEO-akkoord op LAT-1120):
 *   DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<admin-token> \
 *     node directus/scripts/add-infographic-fields.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required. Set it as an environment variable.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 409) return null;
  return res.status === 204 ? null : res.json();
}

function isAlreadyExists(e) {
  const m = e.message;
  return (
    m.includes('already exists') ||
    m.includes('409') ||
    m.includes('already has an associated relationship')
  );
}

async function createCollection(collection, meta = {}) {
  console.log(`Creating collection: ${collection}`);
  try {
    await api('POST', '/collections', {
      collection,
      meta: { icon: meta.icon || 'box', note: meta.note || '', ...meta },
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
  console.log(`  ~ relation: ${relation.collection}.${relation.field} → ${relation.related_collection}`);
  try {
    await api('POST', '/relations', relation);
  } catch (e) {
    if (isAlreadyExists(e)) console.log('    ↳ already exists');
    else throw e;
  }
}

// ── field helpers (zelfde stijl als bootstrap-schema.mjs) ───────────────
const textField = (field, opts = {}) => ({
  field,
  type: 'string',
  meta: { interface: 'input', width: opts.width || 'full', note: opts.note || '' },
  schema: { is_nullable: opts.nullable !== false },
});

const textAreaField = (field, opts = {}) => ({
  field,
  type: 'text',
  meta: { interface: 'input-multiline', width: opts.width || 'full', note: opts.note || '' },
  schema: { is_nullable: opts.nullable !== false },
});

const jsonField = (field, opts = {}) => ({
  field,
  type: 'json',
  meta: { interface: 'input-code', width: 'full', note: opts.note || '', options: { language: 'json' } },
  schema: { is_nullable: true },
});

const integerField = (field, opts = {}) => ({
  field,
  type: 'integer',
  meta: { interface: 'input', width: opts.width || 'half', note: opts.note || '' },
  schema: { is_nullable: true, default_value: opts.default ?? 0 },
});

const slugField = () => ({
  field: 'slug',
  type: 'string',
  meta: { interface: 'input', options: { slug: true }, width: 'half', required: true },
  schema: { is_unique: true, is_nullable: false },
});

const statusField = () => ({
  field: 'status',
  type: 'string',
  meta: {
    interface: 'select-dropdown',
    width: 'half',
    options: {
      choices: [
        { text: 'Published', value: 'published' },
        { text: 'Draft', value: 'draft' },
        { text: 'Archived', value: 'archived' },
      ],
    },
    default_value: 'draft',
  },
  schema: { default_value: 'draft' },
});

// Accent-enum die InfographicAtlas COLOR_HEX ondersteunt: burgundy|rust|vine.
const accentColorField = (field, opts = {}) => ({
  field,
  type: 'string',
  meta: {
    interface: 'select-dropdown',
    width: 'half',
    note: opts.note || 'Atlas-accentkleur (mapt op COLOR_HEX in InfographicAtlas).',
    options: {
      choices: [
        { text: 'Burgundy', value: 'burgundy' },
        { text: 'Rust', value: 'rust' },
        { text: 'Vine', value: 'vine' },
      ],
    },
  },
  schema: { is_nullable: true },
});

async function run() {
  console.log(`\nLAT-1120 infographic schema-uitbreiding @ ${DIRECTUS_URL}\n`);

  // ── landen: map-config + facts-box ────────────────────
  console.log('landen (map-config + facts):');
  for (const f of [
    jsonField('map_config', {
      note: 'Atlas-map config: { viewBox, bbox?, compass?, scaleBar?, backgroundPattern? }. Layers komen uit zones.',
    }),
    textField('infographic_kicker', { note: 'Kicker boven de infographic-kaart' }),
    jsonField('facts_override', {
      note: 'Redactionele override facts-box. Leeg = afgeleid (aantal streken/appellaties uit relaties; kern-druiven=main_grapes; beste reisseizoen=best_time_to_visit).',
    }),
  ]) await createField('landen', f);

  // ── streken: zone-geometrie + regio-laag + druiven-laag ──
  console.log('streken (zone-geometrie + lagen):');
  for (const f of [
    textAreaField('zone_path', {
      note: 'SVG-path d-string in de land-viewBox (laag 1 regio-geometrie). Bron: Design Lead LAT-1121.',
    }),
    accentColorField('zone_color', { note: 'Accentkleur regio-laag' }),
    jsonField('zone_label_offset', { note: 'Labelanker-nudge { "x": number, "y": number }' }),
    accentColorField('grape_color', { note: 'Kleurzone druiven-laag (laag 2)' }),
    textField('dominant_grape', { note: 'Hoofd-druif/stijl-label druiven-laag, bv. "Nebbiolo"' }),
    textField('wine_style', { note: 'Sublabel druiven-laag, bv. "Rood, krachtig"' }),
    integerField('sort_order', { note: 'Render-/legenda-volgorde — laagste eerst' }),
  ]) await createField('streken', f);

  // ── appellaties: nieuwe collection (laag 3) ───────────
  await createCollection('appellaties', {
    icon: 'verified',
    note: 'Appellaties & classificaties per zone (DOCG/DOC + classificatiegrenzen) — laag 3 van de landen-infographic (LAT-1120).',
  });
  for (const f of [
    textField('name', { nullable: false, note: 'bv. "Barolo DOCG"' }),
    slugField(),
    statusField(),
    {
      field: 'classification',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        note: 'Classificatieniveau. Uitbreidbaar voor FR (AOC/IGP) / EU (DOP).',
        options: {
          choices: [
            { text: 'DOCG', value: 'DOCG' },
            { text: 'DOC', value: 'DOC' },
            { text: 'IGT', value: 'IGT' },
          ],
          allowOther: true,
        },
      },
      schema: { is_nullable: true },
    },
    textAreaField('zone_path', {
      note: 'SVG-path d voor classificatiegrens (land-viewBox). Leeg = val terug op streek-zone.',
    }),
    accentColorField('zone_color', { note: 'Accentkleur appellatie-laag' }),
    integerField('sort_order', { note: 'Volgorde — laagste eerst' }),
    textAreaField('description'),
  ]) await createField('appellaties', f);

  // appellaties.streek_id → streken (met reverse-alias streken.appellaties)
  await createField('appellaties', {
    field: 'streek_id',
    type: 'integer',
    meta: { interface: 'select-dropdown-m2o', width: 'half' },
    schema: { is_nullable: true },
  });
  await createField('streken', {
    field: 'appellaties',
    type: 'alias',
    meta: {
      interface: 'list-o2m',
      special: ['o2m'],
      width: 'full',
      note: 'Reverse: appellaties met streek_id naar deze streek.',
      options: { template: '{{name}}' },
    },
    schema: null,
  });
  await createRelation({
    collection: 'appellaties',
    field: 'streek_id',
    related_collection: 'streken',
    meta: { one_field: 'appellaties' },
  });

  // appellaties.land_id → landen (denormalized voor facts-count + cross-country)
  await createField('appellaties', {
    field: 'land_id',
    type: 'integer',
    meta: { interface: 'select-dropdown-m2o', width: 'half' },
    schema: { is_nullable: true },
  });
  await createRelation({
    collection: 'appellaties',
    field: 'land_id',
    related_collection: 'landen',
  });

  console.log('\n✅ LAT-1120 schema-uitbreiding compleet — landen+streken velden + appellaties collection.\n');
}

run().catch((err) => {
  console.error('add-infographic-fields failed:', err.message);
  process.exit(1);
});
