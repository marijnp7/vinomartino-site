#!/usr/bin/env node
/**
 * LAT-13255 — verwijdert de drie DiscoverCars-proefklikken (LAT-13212/LAT-11996) uit
 * affiliate_clicks, op exacte id. Guard: alleen als partner/path/tijdstip kloppen. Idempotent.
 * Run: GHA lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const IDS = {
  "55d1b40c-61ec-4e4f-9892-9a99eac22230": "2026-10-11T16:44:23.831Z",
  "49f31629-241a-4988-a7b3-7d19b4685271": "2026-10-11T22:33:57.277Z",
  "198955b8-7614-4bf7-b28e-4824e0342a26": "2026-10-11T22:33:57.486Z",
};
const H = { Authorization: `Bearer ${T}` };
for (const [id, ts] of Object.entries(IDS)) {
  const r = await fetch(`${U}/items/affiliate_clicks/${id}?fields=id,clicked_at,partner,path`, { headers: H });
  if (r.status === 403 || r.status === 404) { console.log(`[lat13255] ${id} afwezig (${r.status}), overgeslagen`); continue; }
  if (!r.ok) { console.error(`[lat13255] ${id} HTTP ${r.status}`); process.exit(1); }
  const x = (await r.json()).data;
  if (x.partner !== "discovercars" || !x.path.includes("auto-huren-sardinie") || new Date(x.clicked_at).toISOString() !== ts) {
    console.error(`[lat13255] ${id} guard faalt: ${JSON.stringify(x)}`); process.exit(1);
  }
  const d = await fetch(`${U}/items/affiliate_clicks/${id}`, { method: "DELETE", headers: H });
  if (d.status !== 204) { console.error(`[lat13255] ${id} DELETE HTTP ${d.status}`); process.exit(1); }
  console.log(`[lat13255] ${id} verwijderd`);
}
