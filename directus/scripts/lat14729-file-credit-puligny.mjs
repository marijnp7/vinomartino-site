#!/usr/bin/env node
/**
 * LAT-14729 — herkomst van DAM-file 11f3bedd (RS1841, Puligny-Montrachet, Bryan Dougherty)
 * in de canonieke vorm zodat de credit op de Bourgogne-route ook de Commons-bronlink rendert.
 * Oude tekst noemde alleen "Source: Wikimedia Commons – <bestand>" zonder URL (geen link).
 * Bron geverifieerd via de Commons-API op 23-10-2026 (CC BY-SA 2.0). Alleen dit id, alleen herkomst.
 * Idempotent; print readback. Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const ID = "11f3bedd-90f4-42b3-bbb2-044703173d03";
const HERKOMST = "Foto: Bryan Dougherty, CC BY-SA 2.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Chardonnay_in_Puligny_Montrachet.jpg";

const get = async () => (await (await fetch(`${U}/files/${ID}?fields=id,licentie,herkomst`, { headers: H })).json()).data;
const before = await get();
if (!before) { console.error(`file ${ID} niet gevonden`); process.exit(1); }
if (before.herkomst === HERKOMST) {
  console.log(`ok (al gezet) ${ID}`);
} else {
  const r = await fetch(`${U}/files/${ID}`, { method: "PATCH", headers: H, body: JSON.stringify({ herkomst: HERKOMST }) });
  if (!r.ok) { console.error(`PATCH ${r.status}`, await r.text()); process.exit(1); }
  console.log(`patched ${ID}`);
}
const after = await get();
console.log(JSON.stringify(after));
if (after.herkomst !== HERKOMST) process.exit(1);
