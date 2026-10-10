#!/usr/bin/env node
/**
 * LAT-13141 / LAT-12807 — `lat` + `lng` (decimal, nullable) op `wijnhuizen`, gevuld uit
 * `routes.stops_geo` (kind=wijnhuis, slug = wijnhuizen.slug). Nodig voor schema.org `geo`
 * en het Bezoek-kaartje (portret blok 7).
 * Run (admin, schema work): GHA lat12804-directus-schema-migrate.yml, script add-wijnhuis-latlng.mjs
 * Idempotent: bestaande velden overslaan; alleen huizen met lege lat/lng worden gevuld.
 * Rechten: elke field-beperkte wijnhuizen:read-permissie (en de portret-update van
 * content-writer-scoped) wordt verbreed met lat,lng, anders 403't de build-query op de nieuwe velden.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
async function api(method, path, body) {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
  return { status: r.status, ok: r.ok, j, text };
}
const exists = (r) => r.status === 409 || /already exists|RECORD_NOT_UNIQUE|not unique/i.test(r.text);
const log = (...a) => console.log(...a);
const NEW = ["lat", "lng"];

const coord = (f, prec, note) => ({
  field: f, type: "decimal",
  meta: { interface: "input", width: "half", group: "portret_20", note },
  schema: { is_nullable: true, default_value: null, numeric_precision: prec, numeric_scale: 6 },
});

async function main() {
  log("== fields ==");
  for (const def of [coord("lat", 8, "Breedtegraad (WGS84), bv. 49.954000. Voedt schema.org geo + Bezoek-kaartje."),
                     coord("lng", 9, "Lengtegraad (WGS84), bv. 7.031000.")]) {
    const r = await api("POST", "/fields/wijnhuizen", def);
    log(`  ${def.field}:`, r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
    if (!r.ok && !exists(r)) process.exit(2);
  }

  log("== permissions ==");
  const perms = (await api("GET", "/permissions?limit=-1&fields=id,policy,collection,action,fields&filter[collection][_eq]=wijnhuizen")).j.data;
  for (const p of perms.filter((x) => x.action === "read" || x.action === "update")) {
    const f = p.fields || [];
    const tag = `${String(p.policy).slice(0, 8)} ${p.action}`;
    if (f.includes("*") || NEW.every((n) => f.includes(n))) { log(`  ${tag}: ok`); continue; }
    // Update alleen verbreden waar de portret-velden al schrijfbaar zijn (content-writer-scoped).
    if (p.action === "update" && !f.includes("hectares")) { log(`  ${tag}: geen portret-update, overgeslagen`); continue; }
    const r = await api("PATCH", `/permissions/${p.id}`, { fields: [...new Set([...f, ...NEW])] });
    log(`  ${tag}: widened ->`, r.status);
  }

  log("== backfill uit routes.stops_geo ==");
  const routes = (await api("GET", "/items/routes?limit=-1&fields=slug,stops_geo")).j.data;
  const geo = new Map();
  for (const r of routes) {
    let stops = r.stops_geo;
    if (typeof stops === "string") { try { stops = JSON.parse(stops); } catch { stops = []; } }
    for (const s of Array.isArray(stops) ? stops : []) {
      const kind = String(s.kind ?? s.type ?? "").toLowerCase();
      const lat = Number(s.lat), lng = Number(s.lng ?? s.lon);
      if ((kind === "wijnhuis" || kind === "winery") && s.slug && Number.isFinite(lat) && Number.isFinite(lng) && !geo.has(s.slug))
        geo.set(s.slug, { lat, lng, route: r.slug });
    }
  }
  log(`  ${geo.size} wijnhuis-stops met coördinaten`);
  let n = 0;
  for (const [slug, g] of geo) {
    const w = (await api("GET", `/items/wijnhuizen?limit=1&fields=id,slug,lat,lng&filter[slug][_eq]=${encodeURIComponent(slug)}`)).j.data?.[0];
    if (!w) { log(`  ${slug}: geen wijnhuis-record`); continue; }
    if (w.lat != null && w.lng != null) { log(`  ${slug}: al gevuld (${w.lat},${w.lng})`); continue; }
    const r = await api("PATCH", `/items/wijnhuizen/${w.id}`, { lat: g.lat, lng: g.lng });
    log(`  ${slug}: ${g.lat},${g.lng} (route ${g.route}) ->`, r.status);
    if (r.ok) n++;
  }
  log(`done, ${n} gevuld`);
}
main().catch((e) => { console.error(e); process.exit(1); });
