#!/usr/bin/env node
/**
 * Bootstrap Directus schema — creates all 11 collections with fields and relations.
 * Run after Directus is up: DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<admin-token> node directus/scripts/bootstrap-schema.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required. Set it as an environment variable.');
  process.exit(1);
}

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
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 409) {
    console.log(`  ↳ already exists, skipping`);
    return null;
  }
  return res.status === 204 ? null : res.json();
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
    if (e.message.includes('already exists') || e.message.includes('409')) {
      console.log(`  ↳ already exists`);
    } else throw e;
  }
}

async function createField(collection, field) {
  console.log(`  + ${collection}.${field.field}`);
  try {
    await api('POST', `/fields/${collection}`, field);
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('409')) {
      console.log(`    ↳ already exists`);
    } else throw e;
  }
}

async function createRelation(relation) {
  console.log(`  ~ relation: ${relation.collection}.${relation.field} → ${relation.related_collection}`);
  try {
    await api('POST', '/relations', relation);
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('409')) {
      console.log(`    ↳ already exists`);
    } else throw e;
  }
}

// Shared i18n fields for NL/EN/DE/FR
const i18nNote = 'i18n schema ready for NL/EN/DE/FR. Populate NL first.';

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

const richTextField = (field, opts = {}) => ({
  field,
  type: 'text',
  meta: { interface: 'input-rich-text-md', width: 'full', note: opts.note || '' },
  schema: { is_nullable: true },
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
    options: { choices: [
      { text: 'Published', value: 'published' },
      { text: 'Draft', value: 'draft' },
      { text: 'Archived', value: 'archived' },
    ]},
    default_value: 'draft',
  },
  schema: { default_value: 'draft' },
});

const imageField = (field = 'hero_image') => ({
  field,
  type: 'uuid',
  meta: { interface: 'file-image', width: 'full' },
  schema: { is_nullable: true },
});

const seoFields = () => [
  textField('meta_title', { note: 'SEO title override' }),
  textAreaField('meta_description', { note: 'SEO description override' }),
];

const jsonField = (field, opts = {}) => ({
  field,
  type: 'json',
  meta: { interface: 'input-code', width: 'full', note: opts.note || '', options: { language: 'json' } },
  schema: { is_nullable: true },
});

async function run() {
  console.log(`\nBootstrapping Directus schema at ${DIRECTUS_URL}\n`);

  // ── 1. Countries ──────────────────────────────────────
  await createCollection('countries', { icon: 'flag', note: 'Country overview pages' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    statusField(),
    textField('continent'),
    textField('capital'),
    textField('currency'),
    textField('language'),
    textField('timezone'),
    textAreaField('visa_rules'),
    textAreaField('vaccinations'),
    textField('safety_level'),
    jsonField('best_travel_time', { note: 'Per-month score 1-10: {"jan":8,"feb":7,...}' }),
    imageField(),
    textAreaField('description'),
    ...seoFields(),
    jsonField('translations', { note: i18nNote }),
  ]) await createField('countries', f);

  // ── 2. Regions ────────────────────────────────────────
  await createCollection('regions', { icon: 'map', note: 'Geographic sub-units within countries' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    statusField(),
    textAreaField('description'),
    imageField(),
    ...seoFields(),
    jsonField('translations', { note: i18nNote }),
  ]) await createField('regions', f);
  await createField('regions', { field: 'country_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'regions', field: 'country_id', related_collection: 'countries' });

  // ── 3. Destinations ───────────────────────────────────
  await createCollection('destinations', { icon: 'place', note: 'City or place — SEO workhorse pages' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    statusField(),
    textField('country_slug', { note: 'Denormalized for static build' }),
    textField('region_slug'),
    textAreaField('description'),
    jsonField('highlights', { note: 'Array of highlight strings' }),
    imageField(),
    ...seoFields(),
    jsonField('translations', { note: i18nNote }),
  ]) await createField('destinations', f);
  await createField('destinations', { field: 'country_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'destinations', field: 'country_id', related_collection: 'countries' });
  await createField('destinations', { field: 'region_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'destinations', field: 'region_id', related_collection: 'regions' });

  // ── 4. Itineraries ────────────────────────────────────
  await createCollection('itineraries', { icon: 'route', note: 'Ready-to-go travel routes' });
  for (const f of [
    textField('title', { nullable: false }),
    slugField(),
    statusField(),
    textField('country_slug'),
    textField('duration'),
    textField('budget'),
    textField('difficulty'),
    textAreaField('description'),
    richTextField('body'),
    imageField(),
    ...seoFields(),
    jsonField('translations', { note: i18nNote }),
  ]) await createField('itineraries', f);
  await createField('itineraries', { field: 'country_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'itineraries', field: 'country_id', related_collection: 'countries' });

  // ── 5. Articles ───────────────────────────────────────
  await createCollection('articles', { icon: 'article', note: 'Guides, how-tos, experience stories' });
  for (const f of [
    textField('title', { nullable: false }),
    slugField(),
    statusField(),
    textAreaField('description'),
    richTextField('body'),
    textField('author'),
    { field: 'pub_date', type: 'date', meta: { interface: 'datetime', width: 'half' }, schema: { is_nullable: true } },
    textField('category'),
    jsonField('tags', { note: 'Array of tag strings' }),
    imageField(),
    ...seoFields(),
    jsonField('translations', { note: i18nNote }),
  ]) await createField('articles', f);

  // ── 6. Themes ─────────────────────────────────────────
  await createCollection('themes', { icon: 'label', note: 'Thematic filters / taxonomy' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    textAreaField('description'),
    imageField(),
    jsonField('translations', { note: i18nNote }),
  ]) await createField('themes', f);

  // ── 7. Attractions ────────────────────────────────────
  await createCollection('attractions', { icon: 'museum', note: 'Sights: temples, museums, parks' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    textAreaField('description'),
    textField('type', { note: 'temple, museum, park, etc.' }),
    imageField(),
  ]) await createField('attractions', f);
  await createField('attractions', { field: 'destination_id', type: 'integer', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'attractions', field: 'destination_id', related_collection: 'destinations' });

  // ── 8. Accommodations ─────────────────────────────────
  await createCollection('accommodations', { icon: 'hotel', note: 'Hotels, hostels, resorts' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    textAreaField('description'),
    textField('type', { note: 'hotel, hostel, resort, etc.' }),
    textField('price_range'),
    textField('booking_url', { note: 'Affiliate link placeholder' }),
    imageField(),
  ]) await createField('accommodations', f);
  await createField('accommodations', { field: 'destination_id', type: 'integer', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'accommodations', field: 'destination_id', related_collection: 'destinations' });

  // ── 9. Activities ─────────────────────────────────────
  await createCollection('activities', { icon: 'directions_run', note: 'Tours, excursions, experiences' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    textAreaField('description'),
    textField('type'),
    textField('price_range'),
    textField('booking_url', { note: 'Affiliate link placeholder' }),
    imageField(),
  ]) await createField('activities', f);
  await createField('activities', { field: 'destination_id', type: 'integer', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'activities', field: 'destination_id', related_collection: 'destinations' });

  // ── 10. Food Spots ────────────────────────────────────
  await createCollection('food_spots', { icon: 'restaurant', note: 'Restaurants, street food, markets' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    textAreaField('description'),
    textField('type', { note: 'restaurant, street-food, market, etc.' }),
    textField('price_range'),
    imageField(),
  ]) await createField('food_spots', f);
  await createField('food_spots', { field: 'destination_id', type: 'integer', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'food_spots', field: 'destination_id', related_collection: 'destinations' });

  // ── 11. Transport Routes ──────────────────────────────
  await createCollection('transport_routes', { icon: 'directions_bus', note: 'How to get from A to B' });
  for (const f of [
    textField('name', { nullable: false }),
    slugField(),
    textField('from_location'),
    textField('to_location'),
    textField('mode', { note: 'bus, train, flight, ferry, etc.' }),
    textField('duration'),
    textField('cost'),
    textAreaField('description'),
  ]) await createField('transport_routes', f);
  await createField('transport_routes', { field: 'destination_id', type: 'integer', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: true } });
  await createRelation({ collection: 'transport_routes', field: 'destination_id', related_collection: 'destinations' });

  console.log('\n✅ Schema bootstrap complete — 11 collections created.\n');
}

run().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
