#!/usr/bin/env node
/**
 * LAT-13674 — `hero_alt` (string, NL) op `wijnhuizen`. EN staat al op `wijnhuizen_translations.hero_alt`;
 * de loader leest het NL-veld als basis en laat de EN-vertaling het overschrijven.
 * Run (admin, schema work): GHA lat12804-directus-schema-migrate.yml, script lat13674-wijnhuis-hero-alt.mjs
 * Idempotent: bestaand veld overslaan; item barone-di-villagrande-etna alleen vullen als hero_alt leeg is.
 * Rechten: elke field-beperkte wijnhuizen:read wordt verbreed met hero_alt (anders 403't de build-query),
 * en de portret-update van content-writer (herkend aan `hectares`) krijgt hero_alt erbij.
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
const NEW = ["hero_alt"];
const SLUG = "barone-di-villagrande-etna";
const ALT_NL = "Wijngaard met rode en witte druiven op vulkanische bodem bij Passopisciaro, aan de noordflank van de Etna (niet het huis)";

async function main() {
  log("== field ==");
  const r = await api("POST", "/fields/wijnhuizen", {
    field: "hero_alt", type: "string",
    meta: { interface: "input", width: "full", note: "Alt-tekst van de hero (NL): beschrijf wat er op de foto staat. Leeg = huisnaam. EN in translations." },
    schema: { is_nullable: true, default_value: null, max_length: 255 },
  });
  log("  hero_alt:", r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
  if (!r.ok && !exists(r)) process.exit(2);

  log("== permissions ==");
  const perms = (await api("GET", "/permissions?limit=-1&fields=id,policy,collection,action,fields&filter[collection][_eq]=wijnhuizen")).j.data;
  for (const p of perms.filter((x) => x.action === "read" || x.action === "update")) {
    const f = p.fields || [];
    const tag = `${String(p.policy).slice(0, 8)} ${p.action}`;
    if (f.includes("*") || NEW.every((n) => f.includes(n))) { log(`  ${tag}: ok`); continue; }
    if (p.action === "update" && !f.includes("hectares")) { log(`  ${tag}: geen portret-update, overgeslagen`); continue; }
    const w = await api("PATCH", `/permissions/${p.id}`, { fields: [...new Set([...f, ...NEW])] });
    log(`  ${tag}: widened ->`, w.status);
  }

  log("== NL-waarde ==");
  const it = (await api("GET", `/items/wijnhuizen?limit=1&fields=id,slug,hero_alt&filter[slug][_eq]=${SLUG}`)).j.data?.[0];
  if (!it) { log(`  ${SLUG}: geen record`); process.exit(3); }
  if (it.hero_alt) { log(`  ${SLUG} (id ${it.id}): al gevuld: ${it.hero_alt}`); return; }
  const u = await api("PATCH", `/items/wijnhuizen/${it.id}`, { hero_alt: ALT_NL });
  log(`  ${SLUG} (id ${it.id}): ->`, u.status, u.ok ? "" : u.text.slice(0, 200));
  if (!u.ok) process.exit(4);
}
main().catch((e) => { console.error(e); process.exit(1); });
