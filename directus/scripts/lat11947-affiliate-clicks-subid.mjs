// LAT-11947: affiliate_clicks krijgt `subid` en `first_referrer_host` (idempotent, geen persoonsgegevens).
// Run: directus-run-internal.sh --admin --script directus/scripts/lat11947-affiliate-clicks-subid.mjs
const URL_ = process.env.DIRECTUS_URL || 'http://directus:8055';
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!TOKEN) { console.error('DIRECTUS_TOKEN required'); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const api = async (m, p, b) => {
  const r = await fetch(`${URL_}${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  return { ok: r.ok, status: r.status, json: t ? (() => { try { return JSON.parse(t); } catch { return null; } })() : null, text: t };
};
const FIELDS = {
  subid: 'SubID van de plaatsing (uit de uitgaande href), LAT-11947',
  first_referrer_host: 'Eerste externe referrer van de sessie, alleen hostnaam, LAT-11947',
};
for (const [field, note] of Object.entries(FIELDS)) {
  const ex = await api('GET', `/fields/affiliate_clicks/${field}`);
  if (ex.ok) { console.log(`= ${field} bestaat al`); continue; }
  const r = await api('POST', '/fields/affiliate_clicks', {
    field, type: 'string',
    meta: { interface: 'input', width: 'half', note },
    schema: { is_nullable: true, max_length: 255 },
  });
  console.log(`+ ${field}: ${r.status}`);
  if (!r.ok) { console.error(r.text.slice(0, 300)); process.exit(1); }
}
const perms = await api('GET', '/permissions?filter[collection][_eq]=affiliate_clicks&filter[action][_eq]=create&limit=-1');
for (const p of perms.json?.data ?? []) {
  const f = p.fields;
  if (f === null || (Array.isArray(f) && f.includes('*'))) { console.log(`= perm ${p.id} staat alle velden toe`); continue; }
  const next = [...new Set([...(f || []), ...Object.keys(FIELDS)])];
  const r = await api('PATCH', `/permissions/${p.id}`, { fields: next });
  console.log(`~ perm ${p.id} fields -> ${next.join(',')}: ${r.status}`);
}
