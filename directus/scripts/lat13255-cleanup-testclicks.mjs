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

/* LAT-12562 —
 zeven test-klikken van 13-10 (LAT-13406-verificatie + kliktijdmeting) landden met
 * placement `body-link` in plaats van een testplacement (locator-bug in lat12562-clicktime.mjs).
 * Herlabelt ze naar `lat12562-clicktime-body-link`, zodat elke testfilter (prefix `lat12562-`) ze
 * uitsluit. Geen DELETE: omkeerbaar. Guard per rij: exact tijdstip + partner + oude placement. Idempotent.
 * Run: GHA lat12804-directus-schema-migrate.yml.
 */
const HJ = { ...H, "Content-Type": "application/json" };
const NEW = "lat12562-clicktime-body-link";
const TS = [
  "2026-10-13T20:28:12.341Z", "2026-10-13T20:29:46.384Z", "2026-10-13T20:31:33.179Z", "2026-10-13T20:37:30.421Z",
  "2026-10-13T20:39:19.791Z", "2026-10-13T21:12:51.121Z", "2026-10-13T21:14:29.505Z",
];
const f = (o) => "&filter=" + encodeURIComponent(JSON.stringify(o));
for (const ts of TS) {
  const r = await fetch(`${U}/items/affiliate_clicks?fields=id,clicked_at,partner,placement` + f({ clicked_at: { _eq: ts } }), { headers: H });
  if (!r.ok) { console.error(`[lat12562-relabel] ${ts} HTTP ${r.status}`); process.exit(1); }
  const rows = (await r.json()).data.filter((x) => new Date(x.clicked_at).toISOString() === ts && x.partner === "discovercars");
  if (rows.length !== 1) { console.error(`[lat12562-relabel] ${ts} verwacht 1 rij, gevonden ${rows.length}`); process.exit(1); }
  const x = rows[0];
  if (x.placement === NEW) { console.log(`[lat12562-relabel] ${ts} al herlabeld`); continue; }
  if (x.placement !== "body-link") { console.error(`[lat12562-relabel] ${ts} guard faalt: placement=${x.placement}`); process.exit(1); }
  const p = await fetch(`${U}/items/affiliate_clicks/${x.id}`, { method: "PATCH", headers: HJ, body: JSON.stringify({ placement: NEW }) });
  if (!p.ok) { console.error(`[lat12562-relabel] ${ts} PATCH HTTP ${p.status}`); process.exit(1); }
  console.log(`[lat12562-relabel] ${ts} body-link -> ${NEW}`);
}
