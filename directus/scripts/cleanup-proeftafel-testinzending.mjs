/**
 * LAT-13100: verwijder de testinzending(en) van de proeftafel-formuliertest en meld
 * of de mail-flow liep. Raakt UITSLUITEND rijen in wijn_inzendingen met
 * bedrijf == MARKER (exacte match). Geen andere invoer, geen andere collecties.
 *
 * Draait via lat12804-directus-schema-migrate.yml (admin, in vinomartino-directus-1),
 * dus process.env is de Directus-env: alleen set/missing en transportnaam worden geprint.
 */
const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const MARKER = 'TEST LAT-13100 DevOps';
const FLOW_ID = 'c3bc41fc-58e3-4eef-9470-87060df8184b';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_TOKEN ontbreekt'); process.exit(1); }

async function api(method, path) {
  const r = await fetch(`${DIRECTUS_URL}${path}`, { method, headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
  const t = await r.text();
  let json = null; try { json = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, json, text: t };
}

console.log('Mail-env');
for (const k of ['EMAIL_TRANSPORT', 'EMAIL_FROM', 'EMAIL_SMTP_HOST']) {
  const v = process.env[k];
  console.log(`  ${k}: ${v ? (k === 'EMAIL_TRANSPORT' ? v : 'set') : 'MISSING'}`);
}

const enc = encodeURIComponent(MARKER);
const rows = (await api('GET', `/items/wijn_inzendingen?filter[bedrijf][_eq]=${enc}&fields=id,bedrijf,date_created,status&limit=10`)).json?.data || [];
console.log(`Testrijen (bedrijf == "${MARKER}"): ${rows.length}`);
for (const r of rows) console.log(`  id=${r.id} date_created=${r.date_created} status=${r.status}`);

console.log('Flow-log');
const flow = (await api('GET', `/flows/${FLOW_ID}?fields=id,status,accountability`)).json?.data;
console.log(`  flow ${FLOW_ID} status=${flow?.status} accountability=${flow?.accountability}`);
const acts = (await api('GET', `/activity?filter[collection][_eq]=directus_flows&filter[item][_eq]=${FLOW_ID}&sort=-timestamp&limit=3&fields=id,timestamp,revisions.data`)).json?.data || [];
for (const a of acts) {
  const steps = a.revisions?.[0]?.data?.steps || [];
  const s = steps.map((x) => `${x.key}:${x.status}${x.status !== 'resolve' ? ' ' + JSON.stringify(x.data).slice(0, 200) : ''}`).join(' | ');
  console.log(`  activity ${a.id} ${a.timestamp} ${s || '(geen steps)'}`);
}
if (!acts.length) console.log('  (geen flow-activity gevonden)');

for (const r of rows) {
  const d = await api('DELETE', `/items/wijn_inzendingen/${r.id}`);
  const after = await api('GET', `/items/wijn_inzendingen/${r.id}?fields=id`);
  console.log(`  DELETE id=${r.id} -> ${d.status}; GET erna -> ${after.status}`);
}
const left = (await api('GET', `/items/wijn_inzendingen?filter[bedrijf][_eq]=${enc}&fields=id&limit=10`)).json?.data || [];
console.log(`Over na opruimen: ${left.length}`);
