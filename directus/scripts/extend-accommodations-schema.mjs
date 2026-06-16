#!/usr/bin/env node
/**
 * Extend the `accommodations` collection for the reisjunk-style cards (LAT-1331,
 * EPIC LAT-1330).
 *
 * The bootstrap collection only had: name, slug, description, type, price_range,
 * booking_url, hero_image, destination_id. The reisjunk card needs richer,
 * CMS-only fields and a region grouping so the streek-page can render a
 * "Waar te slapen in <regio>" roundup straight from Directus — no hardcoded
 * content or URLs.
 *
 * Adds (idempotent — skips fields that already exist):
 *   - status         (string)  published/draft/archived — drives the publish
 *                              gate so drafts stay out of prod builds (the
 *                              collection shipped without one, unlike wijnhuizen)
 *   - location       (string)  plaats, e.g. "Castelnuovo Berardenga"
 *   - price_low      (integer) Laagseizoen — kamer vanaf EUR
 *   - price_high     (integer) Hoogseizoen — vanaf EUR
 *   - dam_image_ref  (string)  ResourceSpace/DAM ref of the property photo
 *                              (LAT-1334 sets this; rights-aware ingest only)
 *   - streek_id      (m2o → streken) so accommodations group per wine region,
 *                              mirroring wijnhuizen.streek_id
 *
 * Already present, left untouched: description, booking_url (CJ-deeplink, PID
 * 101734849 + unieke SID per property — LAT-923), hero_image.
 *
 * Usage (from VPS, with admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a   # for DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/extend-accommodations-schema.mjs
 *
 * Pass `--dry-run` to print what would be created without writing.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
const COLLECTION = 'accommodations';

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (must be an admin token).');
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
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

// Directus field payloads. Keep interfaces consistent with bootstrap-schema.mjs.
const FIELDS = [
  {
    field: 'status',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      width: 'half',
      options: { choices: [
        { text: 'Published', value: 'published' },
        { text: 'Draft', value: 'draft' },
        { text: 'Archived', value: 'archived' },
      ] },
      default_value: 'draft',
      note: 'Publish-gate: alleen published rendert in prod (DIRECTUS_INCLUDE_DRAFTS=1 toont drafts op preview)',
    },
    schema: { default_value: 'draft' },
  },
  {
    field: 'location',
    type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Plaats, bv. "Castelnuovo Berardenga"' },
    schema: { is_nullable: true },
  },
  {
    field: 'price_low',
    type: 'integer',
    meta: { interface: 'input', width: 'half', note: 'Laagseizoen — kamer vanaf EUR (heel getal)' },
    schema: { is_nullable: true },
  },
  {
    field: 'price_high',
    type: 'integer',
    meta: { interface: 'input', width: 'half', note: 'Hoogseizoen — vanaf EUR (heel getal)' },
    schema: { is_nullable: true },
  },
  {
    field: 'dam_image_ref',
    type: 'string',
    meta: {
      interface: 'input',
      width: 'full',
      note: 'ResourceSpace/DAM-referentie naar de property-foto (LAT-1334). RECHTEN-BEWUST: alleen onder licentie/affiliate toegestane fotos.',
    },
    schema: { is_nullable: true },
  },
  {
    field: 'streek_id',
    type: 'integer',
    meta: { interface: 'select-dropdown-m2o', width: 'half', note: 'Wijnregio waar deze accommodatie onder valt (groepeert de reisjunk-kaart per streek)' },
    schema: { is_nullable: true },
  },
];

async function main() {
  console.log(`Extending '${COLLECTION}' schema for the reisjunk-card (LAT-1331)`);

  const existing = await api('GET', `/fields/${COLLECTION}`);
  const present = new Set(((existing && existing.data) || []).map(f => f.field));
  console.log(`Existing fields: ${[...present].sort().join(', ')}`);

  let created = 0;
  let skipped = 0;
  for (const f of FIELDS) {
    if (present.has(f.field)) {
      console.log(`  ↳ ${f.field}: already exists — skipping`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  ↳ WOULD create ${f.field} (${f.type})`);
      created++;
      continue;
    }
    await api('POST', `/fields/${COLLECTION}`, f);
    console.log(`  ✓ created ${f.field} (${f.type})`);
    created++;
  }

  // Relation: accommodations.streek_id → streken (m2o), mirrors wijnhuizen.
  if (!DRY_RUN && !present.has('streek_id')) {
    const relations = await api('GET', `/relations/${COLLECTION}`);
    const hasRel = ((relations && relations.data) || []).some(r => r.field === 'streek_id');
    if (hasRel) {
      console.log('  ↳ relation streek_id → streken: already exists — skipping');
    } else {
      await api('POST', '/relations', {
        collection: COLLECTION,
        field: 'streek_id',
        related_collection: 'streken',
      });
      console.log('  ✓ created relation streek_id → streken');
    }
  }

  console.log(`\nDone — created: ${created}, skipped: ${skipped}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log('\nNext: Content Writer fills location/price_low/price_high/booking_url, DAM ingest sets dam_image_ref + hero_image, set streek_id per property.');
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
