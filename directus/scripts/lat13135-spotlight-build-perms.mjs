#!/usr/bin/env node
/**
 * LAT-13135 — spotlight-blok zichtbaar voor de build.
 *
 * Symptoom: de Astro-build vraagt `GET /items/wijnhuis_spotlight?filter[status][_eq]=published`
 * en krijgt HTTP 200 met `{"data":[]}`, ondanks een gepubliceerd record (id=1,
 * campagne spotlight-2026-10-14-marziano-abbona). Oorzaak: `lat13075-wijnhuis-spotlight-schema.mjs`
 * mirrort leesrechten van `reispakketten`, maar de build-policy heeft géén leesrecht op
 * `reispakketten`. De build-policy leest wél `articles` (bewijs: `mirror-articles-read-permissions.mjs`
 * heeft die mirroring uitgevoerd).
 *
 * Deze fix:
 * 1. Mirror leesrechten van `articles` naar `wijnhuis_spotlight` (+translations).
 * 2. Controleer of het seed-record (campagne_id spotlight-2026-10-14-marziano-abbona)
 *    nog published is; herstel het als het archived/draft/weg is.
 *
 * Idempotent. Run: GHA lat12804-directus-schema-migrate.yml.
 * --dry-run = alleen GETs.
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

const CAMPAGNE_ID = 'spotlight-2026-10-14-marziano-abbona';
const SELECTIE = {
  wijnhuis_id: 120,
  wijnhuis_slug: 'marziano-abbona-dogliani',
  start_at: '2026-10-14T19:00:00Z',
  end_at: '2026-10-19T19:00:00Z',
  teaser_nl: "Nieuw op VinoMartino: in een streek waar iedereen doorrijdt naar Barolo, laat Marziano Abbona in Dogliani zien hoe serieus Dolcetto kan zijn. Het paradepaardje Papà Celso is vernoemd naar Marziano's vader; de Barolo komt uit Ravera in Novello en Castelletto in Monforte.",
  teaser_en: "New on VinoMartino: in a region where everyone drives straight on to Barolo, Marziano Abbona in Dogliani shows how serious Dolcetto can be. The flagship Papà Celso is named after Marziano's father; the Barolo comes from Ravera in Novello and Castelletto in Monforte.",
};

async function mirrorReadFromArticles() {
  console.log('\n== mirror read permissions van articles naar wijnhuis_spotlight ==');
  const pols = must(await api('GET', '/policies?fields=id,name&limit=-1'), 'list policies').json.data;
  const pub = pols.find((p) => p.name === '$t:public_label')?.id;

  // De build-policy heeft read op articles → die geeft ook read op wijnhuis_spotlight.
  const sources = must(await api('GET', '/permissions?filter[collection][_eq]=articles&filter[action][_eq]=read&fields=policy&limit=-1'), 'articles read perms').json.data || [];
  const uniquePolicies = [...new Set(sources.map((r) => r.policy).filter((p) => p && p !== pub))];
  console.log(`  Articles-read-policies: ${uniquePolicies.length} (${uniquePolicies.map((id) => pols.find((p) => p.id === id)?.name || id).join(', ')})`);

  for (const policy of uniquePolicies) {
    for (const coll of ['wijnhuis_spotlight', 'wijnhuis_spotlight_translations']) {
      const q = `/permissions?filter[collection][_eq]=${coll}&filter[action][_eq]=read&filter[policy][_eq]=${policy}&fields=id`;
      if ((must(await api('GET', q), 'perm check').json?.data || []).length) {
        console.log(`  = read ${coll} (${pols.find((p) => p.id === policy)?.name || policy})`);
        continue;
      }
      must(await api('POST', '/permissions', { policy, collection: coll, action: 'read', permissions: {}, validation: {}, fields: ['*'] }), `perm ${coll}`);
      console.log(`  + read ${coll} (${pols.find((p) => p.id === policy)?.name || policy})`);
    }
  }
}

async function checkAndRestoreSeed() {
  console.log('\n== controleer seed-record ==');
  const rows = must(await api('GET', `/items/wijnhuis_spotlight?filter[campagne_id][_eq]=${CAMPAGNE_ID}&fields=id,status,start_at,end_at,wijnhuis`), 'check seed').json.data || [];
  if (!rows.length) {
    console.log(`  ! record ${CAMPAGNE_ID} ontbreekt — opnieuw aanmaken`);
    const r = must(await api('POST', '/items/wijnhuis_spotlight', {
      status: 'published', wijnhuis: SELECTIE.wijnhuis_id,
      start_at: SELECTIE.start_at, end_at: SELECTIE.end_at,
      campagne_id: CAMPAGNE_ID, teaser: SELECTIE.teaser_nl,
      translations: [{ languages_code: 'en', teaser: SELECTIE.teaser_en }],
    }), 'create spotlight');
    console.log(`  + spotlight-record ${r.json?.data?.id ?? '(dry-run)'} aangemaakt`);
  } else {
    const rec = rows[0];
    console.log(`  = record ${rec.id} gevonden, status=${rec.status}`);
    if (rec.status !== 'published') {
      must(await api('PATCH', `/items/wijnhuis_spotlight/${rec.id}`, { status: 'published' }), 'publish');
      console.log(`  ^ status gewijzigd naar published`);
    }
  }

  // readback
  const all = must(await api('GET', '/items/wijnhuis_spotlight?limit=-1&fields=id,status,wijnhuis,start_at,end_at,campagne_id,translations.languages_code,translations.teaser'), 'readback').json.data || [];
  for (const x of all) {
    const tr = (x.translations || []).map((t) => `${t.languages_code}:${(t.teaser || '').length}`).join(',');
    console.log(`  readback: id=${x.id} ${x.status} huis=${x.wijnhuis} ${x.start_at} -> ${x.end_at} ${x.campagne_id} vertalingen=${tr}`);
  }
}

async function run() {
  console.log(`\nspotlight build-perms fix -> ${DIRECTUS_URL}${DRY_RUN ? '  (dry-run)' : ''}`);
  await mirrorReadFromArticles();
  await checkAndRestoreSeed();
  console.log('\nklaar');
}
run().catch((err) => { console.error('Script failed:', err.message); process.exit(1); });
