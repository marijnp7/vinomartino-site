#!/usr/bin/env node
/**
 * LAT-13099: schema voor "Op de proeftafel".
 *
 * Idempotent (bestaande collectie/veld/relatie/permissie/flow = no-op of PATCH):
 *
 *   Collection `wijn_reviews`            (gepubliceerde wijnreviews, site leest deze)
 *   Collection `wijn_reviews_translations` (languages_code-junction, i18n-translations-schema.mjs-conventie)
 *   Collection `wijn_inzendingen`        (aanmeldingen via /op-de-proeftafel/insturen/)
 *   Permissies:
 *     public  : read wijn_reviews (status=published) + wijn_reviews_translations
 *               (parent published); create wijn_inzendingen op een veld-whitelist
 *               ZONDER status (geen read/update/delete).
 *     build   : read wijn_reviews(+translations) voor elke policy die al read heeft
 *               op `reispakketten` (mirror, met dezelfde row-filter).
 *   Flow      : items.create op wijn_inzendingen -> mail naar info@vinomartino.com.
 *
 * Usage (VPS, admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a     # DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/create-proeftafel-schema.mjs --dry-run
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/create-proeftafel-schema.mjs
 *
 * --dry-run: alleen lezen (GETs) en tonen wat geschreven zou worden.
 */

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
const MAIL_TO = 'info@vinomartino.com';
const FLOW_NAME = 'Proeftafel: mail bij nieuwe wijninzending';

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
const str = (field, note = '', o = {}) => ({
  field, type: 'string',
  meta: { interface: 'input', width: o.width || 'half', note, required: Boolean(o.required) },
  schema: { is_nullable: !o.required, ...(o.unique ? { is_unique: true } : {}), ...(o.max ? { max_length: o.max } : {}) },
});
const txt = (field, note = '', md = false) => ({
  field, type: 'text',
  meta: { interface: md ? 'input-rich-text-md' : 'input-multiline', width: 'full', note },
  schema: { is_nullable: true },
});
const select = (field, pairs, note = '', o = {}) => ({
  field, type: 'string',
  meta: { interface: 'select-dropdown', width: 'half', note, required: Boolean(o.required), options: { choices: choices(pairs), allowOther: Boolean(o.allowOther) }, display: 'labels' },
  // o.dbNullable: verplicht in de app, maar nullable kolom, zodat het veld ook op een
  // collectie met bestaande rijen idempotent toe te voegen is (NOT NULL zonder default faalt daar).
  schema: { is_nullable: o.dbNullable ? true : !o.required, ...(o.default ? { default_value: o.default } : {}) },
});
const bool = (field, note, required = true) => ({
  field, type: 'boolean',
  meta: { interface: 'boolean', width: 'half', note, required },
  schema: { is_nullable: false, default_value: false },
});
const m2o = (field, note, required = false) => ({
  field, type: 'integer',
  meta: { interface: 'select-dropdown-m2o', width: 'half', note, required, options: { template: '{{name}}' } },
  schema: { is_nullable: !required },
});

// Schrijfrichtlijn v2: een winkel nomineert één fles per baan.
const BANEN = [['onder_20', 'Beste fles onder €20'], ['feestfles', 'Beste feestfles']];
const KLEUREN = [['rood', 'Rood'], ['wit', 'Wit'], ['rose', 'Rosé'], ['mousserend', 'Mousserend'], ['zoet', 'Zoet'], ['oranje', 'Oranje']];

// Vertaalbare tekstvelden: staan op de parent (NL) én in wijn_reviews_translations (EN).
const TRANSLATABLE = [
  str('titel', 'Paginatitel (H1)', { width: 'full' }),
  str('seo_title', 'Optioneel: overschrijft de sitetitel. Leeg = formule "{categorie} bij {winkel} in {stad}: {wijn kort} voor {prijs}, kopen of laten staan?"', { width: 'full', max: 200 }),
  str('verdict_zin', 'Eén zin oordeel, bovenaan de pagina', { width: 'full', max: 300 }),
  txt('de_vraag', 'De vraag die deze fles beantwoordt', true),
  str('lijkt_op', 'Lijkt op ...', { width: 'full' }),
  str('voor_wie', 'Voor wie', { width: 'full' }),
  str('niet_voor_wie', 'Niet voor wie', { width: 'full' }),
  txt('smaak', 'Smaak', true),
  txt('leerpunt', 'Eén leerpunt', true),
  txt('wanneer_waarbij', 'Wanneer en waarbij', true),
  str('drinkvenster', 'bv. nu tot 2029'),
  txt('proef_de_streek', 'Brug naar de streek en de wijnroute', true),
  txt('voor_de_liefhebber', 'Optioneel: technische details (inklapbaar)', true),
  str('nominatievraag', 'Optioneel: overschrijft de vaste nominatievraag onderaan (leeg = standaardvraag uit ui-strings)', { width: 'full', max: 300 }),
];

const REVIEW_FIELDS = [
  select('status', [['published', 'Published'], ['draft', 'Draft']], 'Publish-gate: alleen published rendert', { default: 'draft', required: true }),
  str('slug', 'URL-slug, bv. chablis-1er-cru-2022', { unique: true, required: true }),
  str('wijn', 'Naam van de wijn', { required: true }),
  str('producent', 'Producent'),
  str('jaargang', 'Jaargang (of NV)'),
  select('kleur', KLEUREN, 'Kleur'),
  m2o('streek', 'Streek (M2O streken)'),
  m2o('wijnhuis', 'Wijnhuis (M2O wijnhuizen, optioneel)'),
  select('categorie', [['beste-prijs-kwaliteit', 'Beste prijs-kwaliteit']], 'Categorie (uitbreidbaar)', { allowOther: true }),
  select('verdict', [['kopen', 'Kopen'], ['proberen', 'Proberen'], ['laten-staan', 'Laten staan'], ['niet-beoordeeld', 'Niet beoordeeld']], 'Oordeel', { default: 'niet-beoordeeld', required: true }),
  { field: 'prijs_eur', type: 'decimal', meta: { interface: 'input', width: 'half', note: 'Prijs in euro' }, schema: { is_nullable: true, numeric_precision: 10, numeric_scale: 2 } },
  str('winkel_naam', 'Te koop bij (naam)'),
  str('winkel_url', 'Te koop bij (link, zonder UTM: de site voegt utm_* per aflevering toe)', { width: 'full' }),
  str('winkel_stad', 'Stad van de winkel (voor de sitetitel), bv. Amsterdam'),
  str('wijn_kort', 'Druif of wijn kort voor de sitetitel, bv. Syrah', { max: 80 }),
  ...TRANSLATABLE,
  // Schrijfrichtlijn v2: herkomstregel bovenaan, verplicht, vaste tekst uit ui-strings.
  select('herkomst', [['zelf_gekocht', 'Zelf gekocht'], ['gekregen', 'Gekregen']], 'Herkomstregel bovenaan (verplicht). Vaste tekst, alleen de naam hieronder varieert.', { required: true, dbNullable: true }),
  str('herkomst_naam', 'Winkel of afzender in de herkomstregel (leeg = winkelnaam)'),
  bool('affiliate_links', 'Bevat affiliate links (toont de vaste affiliate-melding bovenaan; CJ/Booking/Stay22-links worden ook automatisch herkend)', false),
  { field: 'fles_image', type: 'uuid', meta: { interface: 'file-image', width: 'half', note: 'Flesfoto (via DAM/Directus files)', special: ['file'] }, schema: { is_nullable: true } },
  { field: 'publicatiedatum', type: 'date', meta: { interface: 'datetime', width: 'half', note: 'Publicatiedatum' }, schema: { is_nullable: true } },
];

const INZENDING_FIELDS = [
  select('type_afzender', [['wijnwinkel', 'Wijnwinkel'], ['importeur', 'Importeur'], ['wijnhuis', 'Wijnhuis']], 'Type afzender', { required: true }),
  str('bedrijf', '', { required: true, max: 200 }),
  str('contactpersoon', '', { required: true, max: 200 }),
  str('email', '', { required: true, max: 200 }),
  select('baan', BANEN, 'Prijsbaan van de nominatie (verplicht)', { required: true, dbNullable: true }),
  str('wijn', '', { required: true, max: 200 }),
  str('producent', '', { max: 200 }),
  m2o('streek', 'Streek (M2O streken)'),
  str('jaargang', '', { max: 10 }),
  select('kleur', KLEUREN, ''),
  { field: 'adviesprijs', type: 'decimal', meta: { interface: 'input', width: 'half' }, schema: { is_nullable: true, numeric_precision: 10, numeric_scale: 2 } },
  str('verkoop_url', '', { width: 'full', max: 500 }),
  str('toelichting', 'Max. 300 tekens', { width: 'full', max: 300 }),
  { field: 'aantal_flessen', type: 'integer', meta: { interface: 'input', width: 'half', required: true, options: { min: 1, max: 2 } }, schema: { is_nullable: false, default_value: 1 } },
  bool('akkoord_onafhankelijk', 'Akkoord: onafhankelijk oordeel'),
  bool('akkoord_elk_oordeel', 'Akkoord: elk oordeel mogelijk, ook Laten staan'),
  bool('akkoord_geen_garantie', 'Akkoord: geen publicatiegarantie'),
  bool('akkoord_privacy', 'Akkoord: privacyverklaring'),
  select('status', [['aangemeld', 'Aangemeld'], ['geaccepteerd', 'Geaccepteerd'], ['ontvangen', 'Ontvangen'], ['geproefd', 'Geproefd'], ['gepubliceerd', 'Gepubliceerd'], ['niet-gepubliceerd', 'Niet gepubliceerd']], 'Redactiestatus (niet schrijfbaar voor public)', { default: 'aangemeld', required: true }),
  { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, width: 'half' }, schema: { is_nullable: true } },
];

// Wat het formulier mag zetten. `status` en `date_created` bewust NIET.
const INZENDING_PUBLIC_FIELDS = INZENDING_FIELDS.map((f) => f.field).filter((f) => f !== 'status' && f !== 'date_created');

// ---- permissions -------------------------------------------------------------
async function ensurePermission(policy, collection, action, extra, label) {
  const q = `/permissions?filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&filter[policy][_eq]=${policy}&fields=id`;
  const existing = (await api('GET', q)).json?.data || [];
  const body = { policy, collection, action, permissions: {}, validation: {}, presets: null, fields: ['*'], ...extra };
  const r = existing.length
    ? await api('PATCH', `/permissions/${existing[0].id}`, body)
    : await api('POST', '/permissions', body);
  console.log(`  perm ${action} ${collection} [${label}] ${existing.length ? 'patched' : 'created'} ${r.status}`);
  must(r, `permission ${action} ${collection}`);
}

async function ensurePermissions() {
  console.log('\nPermissions');
  const pols = must(await api('GET', '/policies?fields=id,name&limit=-1'), 'list policies').json.data;
  const pub = pols.find((p) => p.name === '$t:public_label')?.id;
  if (!pub) throw new Error('public policy ($t:public_label) niet gevonden');

  const published = { status: { _eq: 'published' } };
  await ensurePermission(pub, 'wijn_reviews', 'read', { permissions: published }, 'public');
  await ensurePermission(pub, 'wijn_reviews_translations', 'read', { permissions: { wijn_reviews_id: published } }, 'public');
  await ensurePermission(pub, 'wijn_inzendingen', 'create', {
    fields: INZENDING_PUBLIC_FIELDS,
    validation: {
      _and: [
        { akkoord_onafhankelijk: { _eq: true } },
        { akkoord_elk_oordeel: { _eq: true } },
        { akkoord_geen_garantie: { _eq: true } },
        { akkoord_privacy: { _eq: true } },
        { aantal_flessen: { _gte: 1 } },
        { aantal_flessen: { _lte: 2 } },
        { email: { _nnull: true } },
        { baan: { _in: BANEN.map(([v]) => v) } },
        { wijn: { _nnull: true } },
      ],
    },
    presets: { status: 'aangemeld' },
  }, 'public');

  // Build-rol: mirror de read-policies van reispakketten (zelfde content-familie).
  const mirror = must(await api('GET', '/permissions?filter[collection][_eq]=reispakketten&filter[action][_eq]=read&fields=policy,permissions&limit=-1'), 'list reispakketten perms').json.data || [];
  for (const row of mirror) {
    if (!row.policy || row.policy === pub) continue;
    const name = pols.find((p) => p.id === row.policy)?.name || row.policy;
    await ensurePermission(row.policy, 'wijn_reviews', 'read', { permissions: row.permissions || {} }, name);
    await ensurePermission(row.policy, 'wijn_reviews_translations', 'read', {}, name);
  }
  if (!mirror.length) console.log('  ! geen read-policy op reispakketten gevonden: zet build-read op wijn_reviews handmatig.');
}

// ---- flow: mail bij nieuwe inzending ------------------------------------------
const MAIL_BODY = [
  'Nieuwe aanmelding voor Op de proeftafel.',
  '',
  '- Type: {{$trigger.payload.type_afzender}}',
  '- Baan: {{$trigger.payload.baan}}',
  '- Bedrijf: {{$trigger.payload.bedrijf}}',
  '- Contactpersoon: {{$trigger.payload.contactpersoon}}',
  '- E-mail: {{$trigger.payload.email}}',
  '- Wijn: {{$trigger.payload.wijn}}',
  '- Producent: {{$trigger.payload.producent}}',
  '- Streek (id): {{$trigger.payload.streek}}',
  '- Jaargang: {{$trigger.payload.jaargang}}',
  '- Kleur: {{$trigger.payload.kleur}}',
  '- Adviesprijs: {{$trigger.payload.adviesprijs}}',
  '- Verkoop-URL: {{$trigger.payload.verkoop_url}}',
  '- Aantal flessen: {{$trigger.payload.aantal_flessen}}',
  '- Toelichting: {{$trigger.payload.toelichting}}',
  '',
  'Item-id: {{$trigger.key}}. Beoordeel en zet de status in Directus (wijn_inzendingen).',
].join('\n');

async function ensureFlow() {
  console.log('\nFlow');
  const found = (await api('GET', `/flows?filter[name][_eq]=${encodeURIComponent(FLOW_NAME)}&fields=id,operation&limit=1`)).json?.data || [];
  if (found.length && found[0].operation) { console.log(`  = flow ${found[0].id}`); return; }
  let flowId = found[0]?.id;
  if (!flowId) {
    const r = must(await api('POST', '/flows', {
      name: FLOW_NAME,
      icon: 'wine_bar',
      color: '#7A2E2E',
      status: 'active',
      trigger: 'event',
      accountability: 'all',
      options: { type: 'action', scope: ['items.create'], collections: ['wijn_inzendingen'] },
    }), 'create flow');
    flowId = r.json?.data?.id;
    console.log(`  + flow ${flowId ?? '(dry-run)'}`);
  }
  if (DRY_RUN) { console.log('  [dry-run] POST /operations (mail) + PATCH /flows/<id>'); return; }
  const op = must(await api('POST', '/operations', {
    flow: flowId,
    key: 'mail_info',
    name: 'Mail naar info',
    type: 'mail',
    position_x: 19,
    position_y: 1,
    options: {
      to: [MAIL_TO],
      subject: 'Proeftafel: nieuwe aanmelding {{$trigger.payload.wijn}} ({{$trigger.payload.bedrijf}})',
      type: 'markdown',
      body: MAIL_BODY,
    },
  }), 'create mail operation');
  must(await api('PATCH', `/flows/${flowId}`, { operation: op.json.data.id }), 'link operation');
  console.log(`  + operation ${op.json.data.id} -> ${MAIL_TO}`);
}

// ---- run ------------------------------------------------------------------------
async function run() {
  console.log(`\nproeftafel schema -> ${DIRECTUS_URL}${DRY_RUN ? '  (dry-run)' : ''}\n`);

  await ensureCollection('wijn_reviews', { icon: 'wine_bar', note: 'Op de proeftafel: wijnreviews (LAT-13099)', sort_field: null });
  for (const f of REVIEW_FIELDS) await ensureField('wijn_reviews', f);
  await ensureRelation('wijn_reviews', 'streek', 'streken');
  await ensureRelation('wijn_reviews', 'wijnhuis', 'wijnhuizen', { one_deselect_action: 'nullify' });
  await ensureRelation('wijn_reviews', 'fles_image', 'directus_files');

  // translations-junction, zelfde conventie als i18n-translations-schema.mjs
  await ensureCollection('wijn_reviews_translations', { hidden: true, icon: 'translate', note: 'EN/NL translations for wijn_reviews' });
  await ensureField('wijn_reviews_translations', { field: 'wijn_reviews_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', hidden: false, width: 'half' }, schema: { is_nullable: true } });
  await ensureField('wijn_reviews_translations', { field: 'languages_code', type: 'string', meta: { interface: 'select-dropdown-m2o', hidden: false, width: 'half' }, schema: { is_nullable: true } });
  for (const f of TRANSLATABLE) await ensureField('wijn_reviews_translations', f);
  await ensureRelation('wijn_reviews_translations', 'wijn_reviews_id', 'wijn_reviews', { one_field: 'translations', junction_field: 'languages_code', sort_field: null, one_deselect_action: 'delete' });
  await ensureRelation('wijn_reviews_translations', 'languages_code', 'languages', { junction_field: 'wijn_reviews_id' });
  await ensureField('wijn_reviews', {
    field: 'translations', type: 'alias',
    meta: { interface: 'translations', special: ['translations'], width: 'full', options: { languageField: 'code', defaultLanguage: 'nl' } },
    schema: null,
  });

  await ensureCollection('wijn_inzendingen', { icon: 'inbox', note: 'Aanmeldingen Op de proeftafel. Public = create-only (LAT-13099). Bevat persoonsgegevens.', sort_field: null, archive_field: null });
  for (const f of INZENDING_FIELDS) await ensureField('wijn_inzendingen', f);
  await ensureRelation('wijn_inzendingen', 'streek', 'streken', { one_deselect_action: 'nullify' });

  await ensurePermissions();
  await ensureFlow();

  console.log('\nKlaar. Check: mail-transport (EMAIL_TRANSPORT/EMAIL_FROM) in de Directus-env, anders faalt de mail-operation stil in de flow-log.\n');
}

run().catch((err) => {
  console.error('Schema creation failed:', err.message);
  process.exit(1);
});
