#!/usr/bin/env node
/**
 * LAT-13212 — alleen-lezen: DiscoverCars-klikken op de Sardinië-autohuurpagina (NL/EN)
 * sinds 2026-10-11. Geen writes; geen referrer-velden in de output.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin, enige leesroute sinds LAT-7594).
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const flt = { _and: [
  { partner: { _eq: "discovercars" } },
  { path: { _contains: "auto-huren-sardinie" } },
  { clicked_at: { _gte: "2026-10-11T00:00:00Z" } },
] };
const q = "/items/affiliate_clicks?fields=id,clicked_at,partner,placement,context,path,subid&sort=-clicked_at&limit=50&filter="
  + encodeURIComponent(JSON.stringify(flt));
const r = await fetch(U + q, { headers: { Authorization: `Bearer ${T}` } });
const t = await r.text();
if (!r.ok) { console.error(`HTTP ${r.status}: ${t.slice(0, 200)}`); process.exit(1); }
const rows = JSON.parse(t).data;
console.log(`[lat13212] ${rows.length} discovercars-klik(ken) op auto-huren-sardinie sinds 2026-10-11`);
for (const x of rows) console.log("[lat13212]", JSON.stringify(x));
