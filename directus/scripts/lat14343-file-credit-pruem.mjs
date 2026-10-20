#!/usr/bin/env node
/**
 * LAT-14343 vervolg — herkomst van de S.A. Prüm-hero met " | " i.p.v. ". " na de naam.
 * makerFromSegment knipt op de eerste ". ", dus "Weingut S.A. Prüm. Bron:" rendert live als
 * "© Weingut S.A"; met " | " wordt het "© Weingut S.A. Prüm" (getest op creditFromFileMeta).
 * Alleen deze id, alleen licentie+herkomst. Idempotent; print readback.
 * Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const LIC = "pers";

// [file-id, huis, herkomst]
const ROWS = [
  ["a2a64abb-86af-401d-903c-d95c90bf7899", "Weingut S.A. Prüm", "Foto: Weingut S.A. Prüm | Bron: https://www.sapruem.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."],
];

let bad = 0, n = 0;
for (const [id, huis, herkomst] of ROWS) {
  const b = await api("GET", `/files/${id}?fields=id,licentie,herkomst`);
  if (b.status !== 200) { console.log("GET", id, b.status); bad++; continue; }
  if (b.j.data.licentie !== LIC || b.j.data.herkomst !== herkomst) {
    const p = await api("PATCH", `/files/${id}`, { licentie: LIC, herkomst });
    if (p.status !== 200) { console.log("PATCH", id, p.status, JSON.stringify(p.j)?.slice(0, 200)); bad++; continue; }
  }
  const a = await api("GET", `/files/${id}?fields=id,licentie,herkomst,modified_on`);
  const ok = a.j?.data?.licentie === LIC && a.j?.data?.herkomst === herkomst;
  if (!ok) bad++; else n++;
  console.log(ok ? "OK " : "BAD", huis, JSON.stringify(a.j?.data));
}
console.log(`readback: ${n} ok, ${bad} fout`);
process.exit(bad ? 6 : 0);
