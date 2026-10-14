#!/usr/bin/env node
/**
 * LAT-13075 — eerste spotlightselectie, gekozen door de Lead Editor (LAT-13076, R1).
 * Bron van alle waarden: /paperclip/reports/lat13076-spotlight/selectie-1-marziano-abbona.json
 * (teaserbronnen, beeldrecht en regiobewijs staan daar). Dit script schrijft die selectie
 * letterlijk weg; het kiest niets zelf.
 *
 * Daarnaast: create/update op wijnhuis_spotlight(+_translations) voor elke policy die
 * `wijnhuizen` mag updaten, zodat de redactie volgende selecties zelf in Directus zet.
 *
 * Idempotent: bestaat er al een record met deze campagne_id, dan wordt niets geschreven.
 * Run: GHA lat12804-directus-schema-migrate.yml. --dry-run = alleen GETs.
 */

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_TOKEN is required (must be an admin token).'); process.exit(1); }
const HEADERS = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  if (DRY_RUN && method !== 'GET') { console.log(`  [dry-run] ${method} ${path}`); return { ok: true, status: 0, json: { data: null }, text: '' }; }
  const res = await fetch(`${DIRECTUS_URL}${path}`, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, json, text };
}
const must = (r, what) => { if (!r.ok) throw new Error(`${what} -> ${r.status}: ${r.text.slice(0, 400)}`); return r; };

const SELECTIE = {
  campagne_id: 'spotlight-2026-10-14-marziano-abbona',
  wijnhuis_slug: 'marziano-abbona-dogliani',
  wijnhuis_id: 120,
  start_at: '2026-10-14T19:00:00Z',
  end_at: '2026-10-19T19:00:00Z',
  teaser_nl: "Nieuw op VinoMartino: in een streek waar iedereen doorrijdt naar Barolo, laat Marziano Abbona in Dogliani zien hoe serieus Dolcetto kan zijn. Het paradepaardje Papà Celso is vernoemd naar Marziano's vader; de Barolo komt uit Ravera in Novello en Castelletto in Monforte.",
  teaser_en: "New on VinoMartino: in a region where everyone drives straight on to Barolo, Marziano Abbona in Dogliani shows how serious Dolcetto can be. The flagship Papà Celso is named after Marziano's father; the Barolo comes from Ravera in Novello and Castelletto in Monforte.",
};

async function grantEditorWrite() {
  const pols = must(await api('GET', '/policies?fields=id,name&limit=-1'), 'policies').json.data;
  const pub = pols.find((p) => p.name === '$t:public_label')?.id;
  const writers = must(await api('GET', '/permissions?filter[collection][_eq]=wijnhuizen&filter[action][_eq]=update&fields=policy&limit=-1'), 'wijnhuizen update perms').json.data || [];
  for (const policy of [...new Set(writers.map((r) => r.policy))]) {
    if (!policy || policy === pub) continue;
    for (const coll of ['wijnhuis_spotlight', 'wijnhuis_spotlight_translations']) {
      for (const action of ['create', 'update']) {
        const q = `/permissions?filter[collection][_eq]=${coll}&filter[action][_eq]=${action}&filter[policy][_eq]=${policy}&fields=id`;
        if ((must(await api('GET', q), 'perm').json?.data || []).length) { console.log(`  = ${action} ${coll} (${policy})`); continue; }
        must(await api('POST', '/permissions', { policy, collection: coll, action, permissions: {}, validation: {}, fields: ['*'] }), `perm ${action} ${coll}`);
        console.log(`  + ${action} ${coll} (${pols.find((p) => p.id === policy)?.name || policy})`);
      }
    }
  }
}

async function run() {
  console.log(`\nspotlight seed 1 -> ${DIRECTUS_URL}${DRY_RUN ? '  (dry-run)' : ''}`);
  const huis = must(await api('GET', `/items/wijnhuizen/${SELECTIE.wijnhuis_id}?fields=id,slug,status`), 'wijnhuis').json.data;
  if (huis.slug !== SELECTIE.wijnhuis_slug || huis.status !== 'published') throw new Error(`wijnhuis ${SELECTIE.wijnhuis_id} is ${huis.slug}/${huis.status}, verwacht ${SELECTIE.wijnhuis_slug}/published`);
  await grantEditorWrite();
  const bestaand = must(await api('GET', `/items/wijnhuis_spotlight?filter[campagne_id][_eq]=${SELECTIE.campagne_id}&fields=id`), 'bestaand').json.data || [];
  if (bestaand.length) {
    console.log(`= record bestaat al (id ${bestaand[0].id}), niets geschreven`);
  } else {
    const r = must(await api('POST', '/items/wijnhuis_spotlight', {
      status: 'published', wijnhuis: huis.id, start_at: SELECTIE.start_at, end_at: SELECTIE.end_at,
      campagne_id: SELECTIE.campagne_id, teaser: SELECTIE.teaser_nl,
      translations: [{ languages_code: 'en', teaser: SELECTIE.teaser_en }],
    }), 'create spotlight');
    console.log(`+ spotlight-record ${r.json?.data?.id ?? '(dry-run)'}`);
  }
  const rows = must(await api('GET', '/items/wijnhuis_spotlight?limit=-1&fields=id,status,wijnhuis,start_at,end_at,campagne_id,translations.languages_code,translations.teaser'), 'readback').json.data || [];
  for (const x of rows) console.log(`readback: id=${x.id} ${x.status} huis=${x.wijnhuis} ${x.start_at} -> ${x.end_at} ${x.campagne_id} vertalingen=${(x.translations || []).map((t) => `${t.languages_code}:${(t.teaser || '').length}`).join(',')}`);
}
run().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
