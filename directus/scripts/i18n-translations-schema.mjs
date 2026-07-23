#!/usr/bin/env node
/**
 * LAT-2574: i18n T1 — native Directus translations foundation (NL + EN).
 *
 * Idempotent. Safe to re-run. Adds, never silently overwrites content.
 *
 * What it does:
 *   1. `languages` collection (PK `code`) seeded with nl + en.
 *   2. `ui_strings` + `ui_strings_translations` (key -> per-language value)
 *      for navigation/footer/UI/author-bio copy that lives in templates today.
 *   3. Native translations junction per public content collection:
 *        streken, wijnhuizen, landen, routes, accommodations, appellaties
 *      (`<collection>_translations` + `<collection>_id` M2O + `languages_code`
 *       M2O + translatable text fields + parent `translations` alias).
 *      LAT-2602 + LAT-2816: `landen_translations` also carries seven structured
 *      JSON counterparts (main_grapes, cta_blocks, druiven, practical, faq,
 *      reistijd_tabel, budget_tabel). LAT-2602's two were applied straight to
 *      the live Directus and never landed here, so this script had stopped
 *      being the source of truth for a fresh bootstrap. Both sets are now in
 *      `TRANSLATABLE.landen` and created idempotently.
 *   4. `articles` already has `articles_translations` + `translations` alias
 *      (template bootstrap). We only add the missing `languages_code -> languages`
 *      relation and a `hero_alt` field so it matches the others.
 *   5. Content-writer policy (looked up by name, created when absent — LAT-2818)
 *      gets CRUD on every new *_translations + ui_strings(+_translations); read
 *      on languages. Existing collection permissions are left untouched.
 *
 * Destructive note: the empty, unused legacy JSON `translations` field on
 * streken/wijnhuizen/landen/routes is dropped so the native `translations`
 * alias can take that name (matches `articles`). The script re-verifies the
 * field holds zero non-empty rows at runtime and ABORTS the drop otherwise.
 *
 * Rollback: see ROLLBACK section at bottom of LAT-2574 script comment / issue.
 *   Delete the new collections (junctions, ui_strings*, languages), the parent
 *   `translations` aliases, the new permissions rows, and re-add the legacy
 *   json `translations` fields. All additive except the verified-empty drop.
 *
 * Run:
 *   DIRECTUS_URL=http://localhost:8055 ADMIN_TOKEN=<admin> \
 *     node directus/scripts/i18n-translations-schema.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN || process.env.DIRECTUS_TOKEN;
if (!TOKEN) { console.error('ADMIN_TOKEN (or DIRECTUS_TOKEN) is required.'); process.exit(1); }

// LAT-2818: this used to be a hardcoded UUID, which only exists on the live
// instance. On a fresh Directus every POST /permissions then died on an
// INVALID_FOREIGN_KEY. Look the policy up by name and create it when absent.
// CONTENT_WRITER_POLICY_ID pins an explicit id if you ever need to override.
const CONTENT_WRITER_POLICY_NAME = process.env.CONTENT_WRITER_POLICY_NAME || 'content-writer';
let CONTENT_WRITER_POLICY = process.env.CONTENT_WRITER_POLICY_ID || null;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.ok) return { ok: true, status: res.status, json, text };
  if (res.status === 409 || /already exists|has to be unique|duplicate/i.test(text)) {
    return { ok: true, status: res.status, json, text, exists: true };
  }
  return { ok: false, status: res.status, json, text };
}

const summary = {};
function mark(k, v) { summary[k] = v; process.stdout.write(`  ${v.padEnd(9)} ${k}\n`); }

// ---- text-field factory (translatable field inside a junction) ----------
const S = (field, opts = {}) => ({
  field, type: opts.long ? 'text' : 'string',
  meta: { interface: opts.long ? 'input-multiline' : 'input', width: opts.width || 'full',
          note: opts.note || null, special: opts.long ? null : null },
  schema: { is_nullable: true },
});

// ---- json-field factory (structured translatable field inside a junction) ----
// LAT-2602 / LAT-2816: some reader-visible copy lives in structured JSON on the
// parent (grape profiles, practical tips, FAQ, tables). Mirror the parent field
// 1:1 as `json` so the editor can enter a translated counterpart. Empty = fall
// back to NL, so these are never required.
const J = (field, note) => ({
  field, type: 'json',
  meta: {
    interface: 'input-code', options: { language: 'json' }, special: ['cast-json'],
    width: 'full',
    note: `[i18n] Vertaalde tegenhanger van landen.${field}. ${note} `
        + 'Alleen leestekst vertalen; ids/urls/slugs/coords/prijzen/hero_image = NL laten. Leeg = val terug op NL.',
  },
  schema: { is_nullable: true },
});

// Translatable field set per parent collection (reader-visible text only; no UUIDs/numbers).
const TRANSLATABLE = {
  streken: [
    S('name'), S('description', { long: true }), S('body', { long: true }),
    S('climate', { long: true }), S('soil', { long: true }),
    S('waar_slapen_intro', { long: true }), S('trust_bewijs', { long: true }),
    S('card_blurb'), S('meta_title'), S('meta_description', { long: true }),
    S('hero_alt', { note: 'Alt text for hero image (image itself is not duplicated).' }),
  ],
  wijnhuizen: [
    S('description', { long: true }), S('body', { long: true }),
    S('meta_title'), S('meta_description', { long: true }),
    S('hero_alt', { note: 'Alt text for hero image.' }),
  ],
  landen: [
    S('name'), S('description', { long: true }), S('body', { long: true }),
    S('climate', { long: true }), S('wine_history', { long: true }),
    S('best_time_to_visit'), S('hub_h1'), S('infographic_kicker'),
    S('meta_title'), S('meta_description', { long: true }),
    S('hero_alt', { note: 'Alt text for hero image.' }),
    // LAT-2602: applied straight to Directus, never landed here — the script had
    // drifted from the live schema. LAT-2816: the remaining five pillar-hub JSON
    // blocks, which carried the bulk of the untranslated NL copy on /en/landen/*.
    J('main_grapes', 'Array van druivennamen.'),
    J('cta_blocks', '{primary, comparison, closing} — vertaal alleen de copy, laat aid/urls staan.'),
    J('druiven', 'Array van {name, color, description, wines[]} — vertaal name/description/wines-tekst, niet color.'),
    J('practical', 'Array van {key, value}.'),
    J('faq', 'Array van {question, answer}. Voedt FAQPage JSON-LD; moet de zichtbare FAQ spiegelen.'),
    J('reistijd_tabel', 'Array van {regio, vliegveld, reistijd, beste_reistijd}.'),
    J('budget_tabel', 'Array van {categorie, bedrag, toelichting} — bedrag blijft EUR/NL, vertaal categorie + toelichting.'),
  ],
  routes: [
    S('title'), S('description', { long: true }), S('body', { long: true }),
    S('duration'), S('transport'), S('style'),
    S('meta_title'), S('meta_description', { long: true }),
    S('hero_alt', { note: 'Alt text for hero image.' }),
  ],
  accommodations: [
    S('description', { long: true }), S('why_this_one', { long: true }),
    S('why_regel'), S('prijs_disclaimer', { long: true }),
    S('meta_title'), S('meta_description', { long: true }),
    S('hero_alt', { note: 'Alt text for hero image.' }),
  ],
  appellaties: [
    S('description', { long: true }), S('classification'),
  ],
};

// Legacy empty json `translations` fields to drop (verified unused by loaders).
const LEGACY_JSON_TRANSLATIONS = ['streken', 'wijnhuizen', 'landen', 'routes'];

async function collectionExists(c) {
  const r = await api('GET', `/collections/${c}`);
  return r.ok && r.json && r.json.data;
}
async function fieldExists(c, f) {
  const r = await api('GET', `/fields/${c}/${f}`);
  return r.ok && r.json && r.json.data;
}
async function relationExists(c, f) {
  const r = await api('GET', `/relations/${c}/${f}`);
  return r.ok && r.json && r.json.data;
}

// ---- 1. languages -------------------------------------------------------
async function ensureLanguages() {
  if (await collectionExists('languages')) { mark('languages', 'exists'); }
  else {
    const r = await api('POST', '/collections', {
      collection: 'languages',
      meta: { icon: 'translate', note: 'Available site languages', display_template: '{{name}} ({{code}})', sort_field: 'sort' },
      schema: {},
      fields: [
        { field: 'code', type: 'string', meta: { interface: 'input', width: 'half', readonly: false }, schema: { is_primary_key: true, length: 8, is_nullable: false } },
        { field: 'name', type: 'string', meta: { interface: 'input', width: 'half' }, schema: { is_nullable: true } },
        { field: 'direction', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'ltr', value: 'ltr' }, { text: 'rtl', value: 'rtl' }] } }, schema: { default_value: 'ltr', is_nullable: true } },
        { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: { is_nullable: true } },
      ],
    });
    mark('languages', r.ok ? 'created' : `FAIL ${r.status}`);
    if (!r.ok) console.log('   ', r.text.slice(0, 300));
  }
  // seed nl + en
  for (const row of [
    { code: 'nl', name: 'Nederlands', direction: 'ltr', sort: 1 },
    { code: 'en', name: 'English', direction: 'ltr', sort: 2 },
  ]) {
    const g = await api('GET', `/items/languages/${row.code}`);
    if (g.ok && g.json && g.json.data) { mark(`languages:${row.code}`, 'exists'); continue; }
    const r = await api('POST', '/items/languages', row);
    mark(`languages:${row.code}`, r.ok ? 'seeded' : `FAIL ${r.status}`);
  }
}

// ---- generic junction builder ------------------------------------------
async function ensureJunctionCollection(name, note) {
  if (await collectionExists(name)) { mark(name, 'exists'); return; }
  const r = await api('POST', '/collections', {
    collection: name,
    meta: { hidden: true, icon: 'translate', note },
    schema: {},
    fields: [
      { field: 'id', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: { is_primary_key: true, has_auto_increment: true } },
    ],
  });
  mark(name, r.ok ? 'created' : `FAIL ${r.status}`);
  if (!r.ok) console.log('   ', r.text.slice(0, 300));
}

async function ensureField(collection, field) {
  if (await fieldExists(collection, field.field)) { mark(`${collection}.${field.field}`, 'exists'); return; }
  const r = await api('POST', `/fields/${collection}`, field);
  mark(`${collection}.${field.field}`, r.ok ? 'created' : `FAIL ${r.status}`);
  if (!r.ok) console.log('   ', r.text.slice(0, 300));
}

async function ensureM2OField(collection, field, type) {
  if (await fieldExists(collection, field)) return;
  await api('POST', `/fields/${collection}`, {
    field, type,
    meta: { interface: type === 'integer' ? 'select-dropdown-m2o' : 'select-dropdown-m2o', hidden: false, width: 'half' },
    schema: { is_nullable: true },
  });
}

async function ensureRelation(collection, field, related, meta) {
  if (await relationExists(collection, field)) { mark(`rel ${collection}.${field}`, 'exists'); return; }
  const r = await api('POST', '/relations', { collection, field, related_collection: related, meta });
  mark(`rel ${collection}.${field}->${related}`, r.ok ? 'created' : `FAIL ${r.status}`);
  if (!r.ok) console.log('   ', r.text.slice(0, 300));
}

async function ensureParentAlias(parent, aliasField = 'translations') {
  if (await fieldExists(parent, aliasField)) {
    const f = await api('GET', `/fields/${parent}/${aliasField}`);
    const special = f.json?.data?.meta?.special || [];
    if (special.includes('translations')) { mark(`${parent}.${aliasField} alias`, 'exists'); return; }
    mark(`${parent}.${aliasField} alias`, 'CONFLICT-nonalias'); return;
  }
  const r = await api('POST', `/fields/${parent}`, {
    field: aliasField, type: 'alias',
    meta: { interface: 'translations', special: ['translations'], width: 'full',
            options: { languageField: 'code', defaultLanguage: 'nl' } },
    schema: null,
  });
  mark(`${parent}.${aliasField} alias`, r.ok ? 'created' : `FAIL ${r.status}`);
  if (!r.ok) console.log('   ', r.text.slice(0, 300));
}

// ---- drop verified-empty legacy json translations ----------------------
async function dropLegacyTranslations(parent) {
  if (!(await fieldExists(parent, 'translations'))) { mark(`${parent}.translations legacy`, 'absent'); return true; }
  const f = await api('GET', `/fields/${parent}/translations`);
  const type = f.json?.data?.type;
  if (type === 'alias') { mark(`${parent}.translations legacy`, 'already-alias'); return true; }
  // verify empty
  const items = await api('GET', `/items/${parent}?limit=-1&fields=id,translations`);
  const rows = items.json?.data || [];
  const nonEmpty = rows.filter((x) => {
    const t = x.translations;
    if (t == null) return false;
    if (Array.isArray(t)) return t.length > 0;
    if (typeof t === 'object') return Object.keys(t).length > 0;
    return String(t).trim() !== '';
  });
  if (nonEmpty.length > 0) {
    mark(`${parent}.translations legacy`, `ABORT-has-data(${nonEmpty.length})`);
    console.log('   ', 'IDs with data:', nonEmpty.map((x) => x.id).slice(0, 10));
    return false;
  }
  const r = await api('DELETE', `/fields/${parent}/translations`);
  mark(`${parent}.translations legacy`, r.ok ? 'dropped(empty)' : `FAIL ${r.status}`);
  return r.ok;
}

// ---- full native-translations wiring for one parent --------------------
async function ensureTranslations(parent) {
  const junction = `${parent}_translations`;
  const fkField = `${parent}_id`;
  // 1. drop legacy json translations (only listed ones)
  let dropOk = true;
  if (LEGACY_JSON_TRANSLATIONS.includes(parent)) dropOk = await dropLegacyTranslations(parent);
  // 2. junction collection + PK
  await ensureJunctionCollection(junction, `EN/NL translations for ${parent}`);
  // 3. m2o fields
  await ensureM2OField(junction, fkField, 'integer');
  await ensureM2OField(junction, 'languages_code', 'string');
  // 4. translatable value fields
  for (const f of TRANSLATABLE[parent]) await ensureField(junction, f);
  // 5. relations
  await ensureRelation(junction, fkField, parent, { one_field: 'translations', junction_field: 'languages_code', sort_field: null, one_deselect_action: 'delete' });
  await ensureRelation(junction, 'languages_code', 'languages', { junction_field: fkField });
  // 6. parent alias (only if legacy drop succeeded / not needed)
  if (dropOk) await ensureParentAlias(parent);
  else mark(`${parent}.translations alias`, 'SKIP(legacy-has-data)');
}

// ---- articles: junction already exists; only patch gaps ----------------
async function ensureArticles() {
  const junction = 'articles_translations';
  await ensureField(junction, S('hero_alt', { note: 'Alt text for hero image.' }));
  await ensureRelation(junction, 'languages_code', 'languages', { junction_field: 'articles_id' });
  await ensureParentAlias('articles');
}

// ---- ui_strings ---------------------------------------------------------
async function ensureUiStrings() {
  if (await collectionExists('ui_strings')) { mark('ui_strings', 'exists'); }
  else {
    const r = await api('POST', '/collections', {
      collection: 'ui_strings',
      meta: { icon: 'label', note: 'Navigation/footer/UI/author-bio labels (key -> per-language value)', display_template: '{{key}}' },
      schema: {},
      fields: [
        { field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: 'key', type: 'string', meta: { interface: 'input', width: 'full', required: true, note: 'Stable key, e.g. nav.wijnhuizen or footer.copyright' }, schema: { is_nullable: false, is_unique: true } },
        { field: 'context', type: 'string', meta: { interface: 'input', width: 'full', note: 'Where this string appears (for translators).' }, schema: { is_nullable: true } },
      ],
    });
    mark('ui_strings', r.ok ? 'created' : `FAIL ${r.status}`);
    if (!r.ok) console.log('   ', r.text.slice(0, 300));
  }
  await ensureJunctionCollection('ui_strings_translations', 'EN/NL values for ui_strings');
  await ensureM2OField('ui_strings_translations', 'ui_strings_id', 'integer');
  await ensureM2OField('ui_strings_translations', 'languages_code', 'string');
  await ensureField('ui_strings_translations', S('value', { long: true, note: 'Translated label value.' }));
  await ensureRelation('ui_strings_translations', 'ui_strings_id', 'ui_strings', { one_field: 'translations', junction_field: 'languages_code', sort_field: null, one_deselect_action: 'delete' });
  await ensureRelation('ui_strings_translations', 'languages_code', 'languages', { junction_field: 'ui_strings_id' });
  await ensureParentAlias('ui_strings');
}

// ---- permissions --------------------------------------------------------
// Resolve the content-writer policy: explicit id -> lookup by name -> create.
async function ensureContentWriterPolicy() {
  if (CONTENT_WRITER_POLICY) {
    const g = await api('GET', `/policies/${CONTENT_WRITER_POLICY}?fields=id`);
    if (g.ok && g.json && g.json.data) { mark(`policy ${CONTENT_WRITER_POLICY_NAME}`, 'pinned'); return true; }
    mark(`policy ${CONTENT_WRITER_POLICY_NAME}`, `FAIL pinned-id-missing`);
    console.log('   ', `CONTENT_WRITER_POLICY_ID=${CONTENT_WRITER_POLICY} does not exist on ${DIRECTUS_URL}`);
    return false;
  }
  const q = `/policies?limit=1&fields=id&filter[name][_eq]=${encodeURIComponent(CONTENT_WRITER_POLICY_NAME)}`;
  const g = await api('GET', q);
  const hit = g.ok && g.json && Array.isArray(g.json.data) ? g.json.data[0] : null;
  if (hit) {
    CONTENT_WRITER_POLICY = hit.id;
    mark(`policy ${CONTENT_WRITER_POLICY_NAME}`, 'exists');
    return true;
  }
  const r = await api('POST', '/policies', {
    name: CONTENT_WRITER_POLICY_NAME,
    icon: 'edit',
    description: 'Content agent: CRUD articles, read+create directus_files. No admin or settings access.',
    app_access: false,
    admin_access: false,
    enforce_tfa: false,
  });
  CONTENT_WRITER_POLICY = r.json?.data?.id || null;
  mark(`policy ${CONTENT_WRITER_POLICY_NAME}`, r.ok && CONTENT_WRITER_POLICY ? 'created' : `FAIL ${r.status}`);
  if (!r.ok) console.log('   ', r.text.slice(0, 300));
  return Boolean(CONTENT_WRITER_POLICY);
}

async function ensurePermissions() {
  if (!(await ensureContentWriterPolicy())) {
    mark('permissions', 'SKIP(no-policy)');
    return;
  }
  const fullCrud = [
    ...Object.keys(TRANSLATABLE).map((p) => `${p}_translations`),
    'articles_translations',
    'ui_strings', 'ui_strings_translations',
  ];
  for (const coll of fullCrud) {
    for (const action of ['create', 'read', 'update', 'delete']) {
      await ensurePermission(coll, action);
    }
  }
  await ensurePermission('languages', 'read');
}

async function ensurePermission(collection, action) {
  const q = `/permissions?limit=1&filter[policy][_eq]=${CONTENT_WRITER_POLICY}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}`;
  const g = await api('GET', q);
  if (g.ok && g.json && Array.isArray(g.json.data) && g.json.data.length > 0) { mark(`perm ${collection}:${action}`, 'exists'); return; }
  const r = await api('POST', '/permissions', {
    policy: CONTENT_WRITER_POLICY, collection, action,
    permissions: {}, validation: {}, presets: null, fields: ['*'],
  });
  mark(`perm ${collection}:${action}`, r.ok ? 'created' : `FAIL ${r.status}`);
  if (!r.ok) console.log('   ', r.text.slice(0, 300));
}

// ---- main ---------------------------------------------------------------
async function run() {
  console.log(`\nLAT-2574 i18n schema migration -> ${DIRECTUS_URL}\n`);
  console.log('[1] languages'); await ensureLanguages();
  console.log('\n[2] ui_strings'); await ensureUiStrings();
  for (const parent of Object.keys(TRANSLATABLE)) {
    console.log(`\n[3] ${parent}_translations`); await ensureTranslations(parent);
  }
  console.log('\n[4] articles_translations (patch)'); await ensureArticles();
  console.log('\n[5] content-writer permissions'); await ensurePermissions();

  const fails = Object.entries(summary).filter(([, v]) => /FAIL|ABORT|CONFLICT|SKIP/.test(v));
  console.log('\n==== RESULT ====');
  console.log(`total steps: ${Object.keys(summary).length}, problems: ${fails.length}`);
  if (fails.length) { for (const [k, v] of fails) console.log(`  !! ${k}: ${v}`); process.exit(1); }
  console.log('OK — all steps applied or already present.');
}

run().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
