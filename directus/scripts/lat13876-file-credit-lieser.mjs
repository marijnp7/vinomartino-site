#!/usr/bin/env node
/**
 * LAT-13870 — licentie + herkomst op de 4 wijnhuis-files van Weingut Schloss Lieser (hero zelf_geweest=true toont anders geen credit)
 * Toestemming: /paperclip/design/vinomartino/beeld-wijnhuizen/
 * schloss-lieser-mosel/licentie.json. Alleen deze ids, alleen deze twee velden.
 * Licentie: 'toestemming-wijnhuis' als die keuze bestaat, anders 'pers' (precedent LAT-13461).
 * Idempotent; print readback. Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const HERKOMST = {
  "lieser-mekido": "Foto: Mekido / Weingut Schloss Lieser. Bron: https://www.weingut-schloss-lieser.de (toestemming wijnhuis 16-10-2026, redactioneel gebruik, geen AI-bewerking).",
  "lieser-bassler": "Foto: Markus Bassler / Weingut Schloss Lieser. Bron: https://www.weingut-schloss-lieser.de (toestemming wijnhuis 16-10-2026, redactioneel gebruik, geen AI-bewerking).",
  "lieser-huis": "Foto: Weingut Schloss Lieser. Bron: https://www.weingut-schloss-lieser.de (toestemming wijnhuis 16-10-2026, redactioneel gebruik, geen AI-bewerking)."
};
const IDS = {
  "lieser-mekido": ["6ad55056-ae5f-4ad2-a266-ca5e36e33b44", "dc8a60c4-175d-4cbe-98d5-7fa2d4d9ad2c"],
  "lieser-bassler": ["f20fe575-8299-431e-8d5e-884893409631"],
  "lieser-huis": ["7b0237d5-e46b-456e-9e92-223677014726"]
};
const FIELDS = "id,licentie,herkomst";

const f = await api("GET", "/fields/directus_files/licentie");
if (f.status !== 200) { console.error("GET field licentie:", f.status); process.exit(2); }
const choices = (f.j.data.meta?.options?.choices ?? []).map((c) => c.value);
console.log("licentie choices:", JSON.stringify(choices));
const LIC = !choices.length || choices.includes("toestemming-wijnhuis") ? "toestemming-wijnhuis" : "pers";
if (choices.length && !choices.includes(LIC)) { console.error(`'${LIC}' geen geldige keuze`); process.exit(3); }
console.log("licentie ->", LIC);

let bad = 0, n = 0;
for (const [huis, ids] of Object.entries(IDS)) {
  const want = { licentie: LIC, herkomst: HERKOMST[huis] };
  for (const id of ids) {
    const b = await api("GET", `/files/${id}?fields=${FIELDS}`);
    if (b.status !== 200) { console.log("GET", id, b.status); bad++; continue; }
    if (b.j.data.licentie !== want.licentie || b.j.data.herkomst !== want.herkomst) {
      const p = await api("PATCH", `/files/${id}`, want);
      if (p.status !== 200) { console.log("PATCH", id, p.status, JSON.stringify(p.j)?.slice(0, 200)); bad++; continue; }
    }
    const a = await api("GET", `/files/${id}?fields=${FIELDS}`);
    const ok = a.j?.data?.licentie === want.licentie && a.j?.data?.herkomst === want.herkomst;
    if (!ok) bad++; else n++;
    console.log(ok ? "OK " : "BAD", JSON.stringify({ huis, ...a.j?.data }));
  }
}
console.log(`readback: ${n} ok, ${bad} fout`);
process.exit(bad ? 6 : 0);
