#!/usr/bin/env node
/**
 * LAT-13075 — "Wijnhuis in de spotlight" (bouwmandaat Marijn 14-10-2026).
 *
 * Nieuwe, losse collectie (backwards compatible, raakt geen bestaande velden):
 *   wijnhuis_spotlight
 *     status        draft|published|archived
 *     wijnhuis      m2o -> wijnhuizen (naam, regio, bezoekstatus, beeld komen uit het huis)
 *     start_at      timestamp, verplicht  (UTC)
 *     end_at        timestamp, verplicht  (UTC, exclusief)
 *     campagne_id   korte sleutel voor site_events (bv. "2026-10-voerzio")
 *     teaser        NL, max twee zinnen "waarom nu"
 *   wijnhuis_spotlight_translations (languages_code-junction)
 *     teaser        EN
 * CTA/kicker zijn ui_strings (`wijnhuis.spotlight.*`). Overlap: de loader kiest
 * deterministisch één winnaar (laatste start_at, dan laagste id) en logt de rest.
 * Permissions: read voor elke policy die reispakketten leest (build-identity); geen public.
 *
 * Run: GHA lat12804-directus-schema-migrate.yml. --dry-run = alleen GETs.
 */

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (must be an admin token).');
  process.exit(1);
}
const HEADERS = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  if (DRY_RUN && method !== 'GET') {
    console.log(`  [dry-run] ${method} ${path}`);
    return { ok: true, status: 0, json: { data: null }, text: '' };
  }
  const res = await fetch(`${DIRECTUS_URL}${path}`, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, json, text };
}

function must(r, what) {
  if (!r.ok) throw new Error(`${what} -> ${r.status}: ${r.text.slice(0, 400)}`);
  return r;
}

const exists = async (path) => (await api('GET', path)).ok;

async function ensureCollection(collection, meta, pk = 'integer') {
  if (await exists(`/collections/${collection}`)) { console.log(`= collection ${collection}`); return; }
  console.log(`+ collection ${collection}`);
  const idField = pk === 'uuid'
    ? { field: 'id', type: 'uuid', meta: { special: ['uuid'], hidden: true, readonly: true, interface: 'input' }, schema: { is_primary_key: true, is_nullable: false } }
    : { field: 'id', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: { is_primary_key: true, has_auto_increment: true } };
  must(await api('POST', '/collections', { collection, meta, schema: {}, fields: [idField] }), `create ${collection}`);
}

async function ensureField(collection, field) {
  if (await exists(`/fields/${collection}/${field.field}`)) { console.log(`  = ${collection}.${field.field}`); return; }
  console.log(`  + ${collection}.${field.field}`);
  must(await api('POST', `/fields/${collection}`, field), `field ${collection}.${field.field}`);
}

async function ensureRelation(collection, field, related, meta) {
  if (await exists(`/relations/${collection}/${field}`)) { console.log(`  = rel ${collection}.${field}`); return; }
  console.log(`  ~ rel ${collection}.${field} -> ${related}`);
  must(await api('POST', '/relations', { collection, field, related_collection: related, ...(meta ? { meta } : {}) }), `relation ${collection}.${field}`);
}

// ---- field factories ---------------------------------------------------------
const choices = (pairs) => pairs.map(([value, text]) => ({ value, text }));
const TEASER_NOTE = 'Max twee zinnen: waarom is dit huis nu interessant. Geen bezoek-, prijs- of beschikbaarheidsclaims die niet in het portret staan.';
const FIELDS = [
  { field: 'status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', required: true, options: { choices: [{ value: 'draft', text: 'Draft' }, { value: 'published', text: 'Published' }, { value: 'archived', text: 'Archived' }] }, display: 'labels', note: 'Alleen published telt mee.' }, schema: { is_nullable: false, default_value: 'draft' } },
  { field: 'wijnhuis', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half', required: true, options: { template: '{{name}}' }, note: 'Gepubliceerd huis met DAM-hero (licentie bekend). Naam/regio/bezoekstatus komen hiervandaan.' }, schema: { is_nullable: true } },
  { field: 'start_at', type: 'timestamp', meta: { interface: 'datetime', width: 'half', required: true, note: 'Zichtbaar vanaf (Europe/Amsterdam in de UI, UTC opgeslagen).' }, schema: { is_nullable: true } },
  { field: 'end_at', type: 'timestamp', meta: { interface: 'datetime', width: 'half', required: true, note: 'Zichtbaar tot (exclusief). 4-7 dagen na start. Overlap met een andere published spotlight: alleen de laatst gestarte wint.' }, schema: { is_nullable: true } },
  { field: 'campagne_id', type: 'string', meta: { interface: 'input', width: 'half', note: 'Sleutel voor de meting, bv. 2026-10-voerzio.' }, schema: { is_nullable: true, max_length: 60 } },
  { field: 'teaser', type: 'text', meta: { interface: 'input-multiline', width: 'full', required: true, note: `NL. ${TEASER_NOTE}` }, schema: { is_nullable: true } },
];

async function ensurePermissions() {
  const pols = must(await api('GET', '/policies?fields=id,name&limit=-1'), 'list policies').json.data;
  const pub = pols.find((p) => p.name === '$t:public_label')?.id;
  const mirror = must(await api('GET', '/permissions?filter[collection][_eq]=reispakketten&filter[action][_eq]=read&fields=policy&limit=-1'), 'list reispakketten perms').json.data || [];
  for (const row of mirror) {
    if (!row.policy || row.policy === pub) continue;
    for (const coll of ['wijnhuis_spotlight', 'wijnhuis_spotlight_translations']) {
      const q = `/permissions?filter[collection][_eq]=${coll}&filter[action][_eq]=read&filter[policy][_eq]=${row.policy}&fields=id`;
      if ((must(await api('GET', q), 'perm').json?.data || []).length) { console.log(`  = read ${coll} (${row.policy})`); continue; }
      must(await api('POST', '/permissions', { policy: row.policy, collection: coll, action: 'read', permissions: {}, validation: {}, fields: ['*'] }), `perm ${coll}`);
      console.log(`  + read ${coll} (${pols.find((p) => p.id === row.policy)?.name || row.policy})`);
    }
  }
}

async function run() {
  console.log(`\nwijnhuis_spotlight schema -> ${DIRECTUS_URL}${DRY_RUN ? '  (dry-run)' : ''}`);
  await ensureCollection('wijnhuis_spotlight', { icon: 'star', note: 'Wijnhuis in de spotlight: precies één tegelijk, 4-7 dagen (LAT-13075).', sort_field: null });
  for (const f of FIELDS) await ensureField('wijnhuis_spotlight', f);
  await ensureRelation('wijnhuis_spotlight', 'wijnhuis', 'wijnhuizen', { one_deselect_action: 'nullify' });
  await ensureCollection('wijnhuis_spotlight_translations', { hidden: true, icon: 'translate', note: 'EN voor wijnhuis_spotlight' });
  await ensureField('wijnhuis_spotlight_translations', { field: 'wijnhuis_spotlight_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', width: 'half' }, schema: { is_nullable: true } });
  await ensureField('wijnhuis_spotlight_translations', { field: 'languages_code', type: 'string', meta: { interface: 'select-dropdown-m2o', width: 'half' }, schema: { is_nullable: true } });
  await ensureField('wijnhuis_spotlight_translations', { field: 'teaser', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: TEASER_NOTE }, schema: { is_nullable: true } });
  await ensureRelation('wijnhuis_spotlight_translations', 'wijnhuis_spotlight_id', 'wijnhuis_spotlight', { one_field: 'translations', junction_field: 'languages_code', sort_field: null, one_deselect_action: 'delete' });
  await ensureRelation('wijnhuis_spotlight_translations', 'languages_code', 'languages', { junction_field: 'wijnhuis_spotlight_id' });
  await ensureField('wijnhuis_spotlight', { field: 'translations', type: 'alias', meta: { interface: 'translations', special: ['translations'], width: 'full', options: { languageField: 'code', defaultLanguage: 'nl' } }, schema: null });
  await ensurePermissions();
  const rows = (await api('GET', '/items/wijnhuis_spotlight?limit=-1&fields=id,status')).json?.data || [];
  console.log(`klaar: ${rows.length} spotlight-records (${rows.filter((r) => r.status === 'published').length} published)`);
}
run().catch((err) => { console.error('Schema failed:', err.message); process.exit(1); });
