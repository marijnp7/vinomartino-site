#!/usr/bin/env node
/**
 * LAT-13461 — zet licentie + herkomst op de spotlight-hero van Marziano Abbona (LAT-13075).
 * Inhoud beslist door Design Lead (DAM-eigenaar), toestemming:
 * /paperclip/design/vinomartino/beeld-wijnhuizen/marziano-abbona/licentie.json (2026-10-08).
 * Alleen deze ene file-id, alleen deze twee velden. Idempotent; print readback.
 * Run (admin): .github/workflows/lat12804-directus-schema-migrate.yml, script = deze file.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const ID = "cd251c75-a3e7-4763-bba2-9e2b9050ffab";
const WANT = { licentie: "pers", herkomst: "Foto: Marziano Abbona. Bron: https://www.abbona.com" };
const FIELDS = "id,filename_download,licentie,herkomst,modified_on";

// Valideer tegen de keuzelijst van het veld, zodat een typo niet stil wordt opgeslagen.
const f = await api("GET", "/fields/directus_files/licentie");
if (f.status !== 200) { console.error("GET field licentie:", f.status); process.exit(2); }
const choices = (f.j.data.meta?.options?.choices ?? []).map((c) => c.value);
console.log("licentie choices:", JSON.stringify(choices));
if (choices.length && !choices.includes(WANT.licentie)) { console.error(`'${WANT.licentie}' geen geldige keuze`); process.exit(3); }

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
