#!/usr/bin/env node
/**
 * LAT-13766 — licentie=eigen + herkomst + synthetisch=false op de drie eigen La Spinetta-files
 * (RS 3253 proeverij, 3254 kelder, 3255 wijngaarden). Inhoud beslist door Design Lead (DAM-eigenaar),
 * bezoek bevestigd door Marijn 16-10-2026 (LAT-13763). Alleen deze ids, alleen deze drie velden.
 * Idempotent; print readback. Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const BEZOEK = "Eigen werk Marijn / VinoMartino. Bezoek La Spinetta juli 2021 (bevestigd Marijn 16-10-2026).";
const WANT = {
  "b3d3b7eb-66e0-4dbc-8999-c42731dd461f": "Eigen werk Marijn / VinoMartino. Opnamedatum 2021-07-19 (EXIF, iPhone 12), proeverij in de proefruimte van La Spinetta, Castagnole delle Lanze. Uit ResourceSpace ref 3253. Bijschrift door Marijn bevestigd (LAT-13763): leesbare etiketten Langhe Nebbiolo 2018, Barbaresco Starderi 2015, Barolo Campè 2016.",
  "9e01c8e5-dc62-4816-8834-392f9da65bc5": `${BEZOEK} Uit ResourceSpace ref 3254.`,
  "cd488fb1-737c-4a16-9140-bb23d377e253": `${BEZOEK} Uit ResourceSpace ref 3255.`,
};
const LICENTIE = "eigen";
const FIELDS = "id,filename_download,licentie,herkomst,synthetisch,modified_on";

// Valideer tegen de keuzelijst van het veld, zodat een typo niet stil wordt opgeslagen.
const f = await api("GET", "/fields/directus_files/licentie");
if (f.status !== 200) { console.error("GET field licentie:", f.status); process.exit(2); }
const choices = (f.j.data.meta?.options?.choices ?? []).map((c) => c.value);
console.log("licentie choices:", JSON.stringify(choices));
if (choices.length && !choices.includes(LICENTIE)) { console.error(`'${LICENTIE}' geen geldige keuze`); process.exit(3); }

let bad = 0;
for (const [id, herkomst] of Object.entries(WANT)) {
  const want = { licentie: LICENTIE, herkomst, synthetisch: false };
  const before = await api("GET", `/files/${id}?fields=${FIELDS}`);
  if (before.status !== 200) { console.error("GET file:", id, before.status); bad++; continue; }
  console.log("before:", JSON.stringify(before.j.data));
  const d = before.j.data;
  if (d.licentie === want.licentie && d.herkomst === want.herkomst && d.synthetisch === false) { console.log("already set", id); continue; }
  const p = await api("PATCH", `/files/${id}`, want);
  console.log("PATCH:", id, p.status);
  if (p.status !== 200) { console.error(JSON.stringify(p.j)); bad++; continue; }
  const a = (await api("GET", `/files/${id}?fields=${FIELDS}`)).j?.data;
  console.log("after:", JSON.stringify(a));
  if (a?.licentie !== want.licentie || a?.herkomst !== want.herkomst || a?.synthetisch !== false) bad++;
}
process.exit(bad ? 6 : 0);
