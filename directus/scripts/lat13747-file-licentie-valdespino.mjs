#!/usr/bin/env node
/**
 * LAT-13747 — corrigeer licentie + herkomst van de Valdespino-hero (wijnhuizen 101,
 * bodegas-valdespino-jerez). Beslist door Design Lead (LAT-13062): het bestand is
 * https://commons.wikimedia.org/wiki/File:BodegasValdespino-P1010203.JPG van El Pantera,
 * CC BY-SA 3.0 (niet 4.0). Bewijs: /paperclip/design/vinomartino/lat13062-review/valdespino/.
 * Alleen deze ene file-id, alleen deze twee velden. Idempotent; print readback.
 * Ontbreekt `cc-by-sa-3.0` in de keuzelijst van het veld, dan voegt het script alleen díe
 * ene optie toe (bestaande opties blijven ongemoeid).
 * Run (admin): .github/workflows/lat12804-directus-schema-migrate.yml, script = deze file.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const ID = "6645c3b4-e851-4a87-b658-dbf6f93defbc";
const WANT = {
  licentie: "cc-by-sa-3.0",
  herkomst: "Foto: El Pantera, CC BY-SA 3.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:BodegasValdespino-P1010203.JPG",
};
const FIELDS = "id,filename_download,licentie,herkomst,modified_on";

const f = await api("GET", "/fields/directus_files/licentie");
if (f.status !== 200) { console.error("GET field licentie:", f.status); process.exit(2); }
const choicesRaw = f.j.data.meta?.options?.choices ?? [];
const choices = choicesRaw.map((c) => c.value);
console.log("licentie choices:", JSON.stringify(choices));
if (choices.length && !choices.includes(WANT.licentie)) {
  const options = { ...f.j.data.meta.options, choices: [...choicesRaw, { text: "CC BY-SA 3.0", value: WANT.licentie }] };
  const pf = await api("PATCH", "/fields/directus_files/licentie", { meta: { options } });
  console.log("PATCH field choice add:", pf.status);
  if (pf.status !== 200) { console.error(JSON.stringify(pf.j)); process.exit(3); }
}

const before = await api("GET", `/files/${ID}?fields=${FIELDS}`);
if (before.status !== 200) { console.error("GET file:", before.status); process.exit(4); }
console.log("before:", JSON.stringify(before.j.data));
if (before.j.data.licentie === WANT.licentie && before.j.data.herkomst === WANT.herkomst) {
  console.log("already set"); process.exit(0);
}
const p = await api("PATCH", `/files/${ID}`, WANT);
console.log("PATCH:", p.status);
if (p.status !== 200) { console.error(JSON.stringify(p.j)); process.exit(5); }
const after = await api("GET", `/files/${ID}?fields=${FIELDS}`);
console.log("after:", JSON.stringify(after.j?.data));
if (after.j?.data?.licentie !== WANT.licentie || after.j?.data?.herkomst !== WANT.herkomst) process.exit(6);
