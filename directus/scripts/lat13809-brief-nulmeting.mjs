#!/usr/bin/env node
/**
 * LAT-13809 — alleen-lezen nulmeting De Brief: aantallen site_events voor
 * newsletter_signup en substack_link (als event of cta_id), laatste 90 dagen,
 * gesplitst op is_internal. Alleen aggregaten; geen sessie-, referrer- of persoonsvelden.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin, enige leesroute site_events).
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const since = new Date(Date.now() - 90 * 864e5).toISOString();
const ids = ["newsletter_signup", "substack_link"];
const flt = { _and: [{ ts: { _gte: since } }, { _or: [{ event: { _in: ids } }, { cta_id: { _in: ids } }] }] };
const q = "/items/site_events?aggregate[count]=id&groupBy[]=event&groupBy[]=cta_id&groupBy[]=is_internal&groupBy[]=lang&limit=-1&filter="
  + encodeURIComponent(JSON.stringify(flt));
const r = await fetch(U + q, { headers: { Authorization: `Bearer ${T}` } });
const t = await r.text();
if (!r.ok) { console.error(`HTTP ${r.status}: ${t.slice(0, 200)}`); process.exit(1); }
const rows = JSON.parse(t).data;
console.log(`[lat13809] sinds ${since}: ${rows.length} groep(en)`);
for (const x of rows) console.log("[lat13809]", JSON.stringify(x));
const f = { ts: { _gte: since } };
const tot = await fetch(U + "/items/site_events?aggregate[count]=id&groupBy[]=is_internal&filter=" + encodeURIComponent(JSON.stringify(f)), { headers: { Authorization: `Bearer ${T}` } }).then(x => x.json());
console.log("[lat13809] alle site_events 90d per is_internal", JSON.stringify(tot.data));
