// LAT-13406: affiliate_clicks krijgt `via_linkswap` (boolean, nullable, idempotent). True = het Stay22
// LinkSwap-script (letmeallez.js) was op de pagina geladen op het klikmoment, dus de bestemming kan door
// Stay22 herschreven zijn (Booking aid 1607597, GYG ZM6TN20). Reconciliatie legt die klikken tegen
// Stay22-rapportage in plaats van CJ. Null = oude klik of niet gemeten.
// Run: GHA lat12804-directus-schema-migrate.yml (script=lat13406-affiliate-clicks-via-linkswap.mjs).
const URL_ = process.env.DIRECTUS_URL || 'http://directus:8055';
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!TOKEN) { console.error('DIRECTUS_TOKEN required'); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const api = async (m, p, b) => {
  const r = await fetch(`${URL_}${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  return { ok: r.ok, status: r.status, json: t ? (() => { try { return JSON.parse(t); } catch { return null; } })() : null, text: t };
};
const FIELD = 'via_linkswap';
const ex = await api('GET', `/fields/affiliate_clicks/${FIELD}`);
if (ex.ok) console.log(`= ${FIELD} bestaat al`);
else {
  const r = await api('POST', '/fields/affiliate_clicks', {
    field: FIELD, type: 'boolean',
    meta: { interface: 'boolean', width: 'half', note: 'Stay22 LinkSwap actief op de pagina bij de klik, LAT-13406' },
    schema: { is_nullable: true, default_value: null },
  });
  console.log(`+ ${FIELD}: ${r.status}`);
  if (!r.ok) { console.error(r.text.slice(0, 300)); process.exit(1); }
}
const perms = await api('GET', '/permissions?filter[collection][_eq]=affiliate_clicks&filter[action][_eq]=create&limit=-1');
if (!perms.ok) { console.error(`permissions: ${perms.status}`); process.exit(1); }
for (const p of perms.json?.data ?? []) {
  const f = p.fields;
  if (f === null || (Array.isArray(f) && f.includes('*'))) { console.log(`= perm ${p.id} staat alle velden toe`); continue; }
  if (f.includes(FIELD)) { console.log(`= perm ${p.id} heeft ${FIELD} al`); continue; }
  const r = await api('PATCH', `/permissions/${p.id}`, { fields: [...f, FIELD] });
  console.log(`~ perm ${p.id} +${FIELD}: ${r.status}`);
  if (!r.ok) process.exit(1);
}
