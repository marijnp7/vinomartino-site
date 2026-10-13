#!/usr/bin/env node
/**
 * LAT-12562 — alleen-lezen meting: vulling van `subid` en `first_referrer_host` in
 * affiliate_clicks, plus versheid van affiliate_commissions. Geen writes, geen rijen
 * met paden/referrers in de output: alleen aantallen. Testevents (placement
 * `lat12562-testklik`) worden apart geteld en niet meegeteld.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin, enige leesroute sinds LAT-7594).
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}` };
const TEST = "lat12562-"; // prefix: testklik (11-10) + clicktime (Playwright, 13-10)
async function get(path) {
  const r = await fetch(U + path, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${path.split("?")[0]}: ${t.slice(0, 200)}`);
  return JSON.parse(t).data;
}
const f = (o) => "&filter=" + encodeURIComponent(JSON.stringify(o));
const count = async (flt) => Number((await get("/items/affiliate_clicks?aggregate[count]=*" + f(flt)))[0].count);
const real = { _or: [{ placement: { _null: true } }, { placement: { _nstarts_with: TEST } }] };

const tests = await get("/items/affiliate_clicks?fields=clicked_at,placement,partner,context,subid,first_referrer_host,via_linkswap" + f({ placement: { _starts_with: TEST } }));
console.log("[lat12562] testevents:", JSON.stringify(tests));
const tot = await get("/items/affiliate_clicks?aggregate[count]=*&aggregate[max]=clicked_at" + f(real));
console.log("[lat12562] echt totaal + max clicked_at:", JSON.stringify(tot));

const day = 86400000;
console.log("[lat12562] dag | klikken | subid | first_referrer_host");
let sum = [0, 0, 0];
for (let d = Date.parse("2026-09-15T00:00:00Z"); d < Date.now(); d += day) {
  const w = { _and: [real, { clicked_at: { _gte: new Date(d).toISOString() } }, { clicked_at: { _lt: new Date(d + day).toISOString() } }] };
  const all = await count(w);
  if (!all) continue;
  const sub = await count({ _and: [...w._and, { subid: { _nempty: true } }] });
  const ref = await count({ _and: [...w._and, { first_referrer_host: { _nempty: true } }] });
  console.log(`${new Date(d).toISOString().slice(0, 10)} | ${all} | ${sub} | ${ref}`);
  if (d >= Date.parse("2026-10-11T00:00:00Z")) sum = [sum[0] + all, sum[1] + sub, sum[2] + ref];
}
console.log("[lat12562] vanaf 2026-10-11 (meetweek):", JSON.stringify({ klikken: sum[0], subid: sum[1], first_referrer_host: sum[2] }));
const byPartner = await get("/items/affiliate_clicks?aggregate[count]=*&groupBy[]=partner" + f({ _and: [real, { clicked_at: { _gte: "2026-09-01T00:00:00Z" } }] }));
console.log("[lat12562] per partner sinds 09-01:", JSON.stringify(byPartner));
const comm = await get("/items/affiliate_commissions?aggregate[count]=*&aggregate[max]=imported_at,event_date");
console.log("[lat12562] commissions count + max imported_at/event_date:", JSON.stringify(comm));
// Echte rijen van de laatste 48 uur, om testverkeer zonder testplacement te herkennen.
// Geen paden of referrer-hosts: alleen of first_referrer_host 'direct', extern of leeg is.
const recent = await get("/items/affiliate_clicks?limit=200&sort=clicked_at&fields=clicked_at,placement,partner,context,subid,first_referrer_host,via_linkswap" + f({ _and: [real, { clicked_at: { _gte: new Date(Date.now() - 2 * day).toISOString() } }] }));
console.log("[lat12562] echt laatste 48u:", JSON.stringify(recent.map((r) => ({ ...r, first_referrer_host: r.first_referrer_host == null ? null : r.first_referrer_host === "direct" ? "direct" : "extern" }))));
