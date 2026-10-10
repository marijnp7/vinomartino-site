#!/usr/bin/env node
/**
 * LAT-12924 — vertaalbare portret-2.0-velden op `wijnhuizen_translations`, zodat /en/wijnhuizen/<slug>
 * geen NL-copy toont (HARDE REGEL 20). Spiegelt de NL-velden uit add-wijnhuis-portret-fields.mjs:
 *   waarom_hier (json string[]), onze_ervaring (text, md), faq (json [{vraag, antwoord}]),
 *   openingstijden_opmerking (string; EN-variant van wijnhuizen.openingstijden.opmerking).
 * `proeverij` krijgt geen vertaalveld: dat object heeft alleen prijs/duur/taal/url, geen leestekst.
 * Permissies: content-writer create/read/update op deze velden; elke bestaande read-rij op
 * wijnhuizen_translations met een veldlijst (bv. de build-rol) wordt verbreed, anders breekt de EN-build.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin). Idempotent.
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

const C = "wijnhuizen_translations";
const CW = "6b7abca9-c8a1-42de-9374-71491806308e";       // content-writer (content-agent, seed-runner)
const CWS = "28dee565-e9c6-4296-8371-353759bb0c43";      // content-writer-scoped (atelier / design)
const EN_NOTE = "Leeg = blok verborgen op /en/ (geen NL-fallback, LAT-12924).";

const fields = [
  { field: "waarom_hier", type: "json",
    meta: { interface: "tags", special: ["cast-json"], width: "full", note: `Max 3 korte strings (blok 'Waarom je hier heen gaat'). ${EN_NOTE}` },
    schema: { is_nullable: true, default_value: null } },
  { field: "onze_ervaring", type: "text",
    meta: { interface: "input-rich-text-md", width: "full", note: `Ik-vorm, markdown. Alleen als wijnhuizen.zelf_geweest = true. ${EN_NOTE}` },
    schema: { is_nullable: true, default_value: null } },
  { field: "faq", type: "json",
    meta: { interface: "list", special: ["cast-json"], width: "full", note: `[{vraag, antwoord}] (blok 'Snel antwoord' + FAQPage-markup). ${EN_NOTE}`,
      options: { template: "{{vraag}}", fields: [
        { field: "vraag", name: "Vraag", type: "string", meta: { interface: "input", width: "full" } },
        { field: "antwoord", name: "Antwoord", type: "text", meta: { interface: "input-multiline", width: "full" } } ] } },
    schema: { is_nullable: true, default_value: null } },
  { field: "openingstijden_opmerking", type: "string",
    meta: { interface: "input", width: "full", note: `Vertaling van wijnhuizen.openingstijden.opmerking. ${EN_NOTE}` },
    schema: { is_nullable: true, default_value: null } },
];
const NEW = fields.map((f) => f.field);

log("== fields ==");
const res = {};
for (const def of fields) {
  const r = await api("POST", `/fields/${C}`, def);
  res[def.field] = r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 160)}`;
  log(`  ${def.field}:`, res[def.field]);
}

log("== permissions ==");
const perms = (await api("GET", `/permissions?limit=-1&fields=id,policy,action,fields&filter[collection][_eq]=${C}`)).j.data;
for (const p of perms) log(`  voor: ${p.policy.slice(0, 8)} ${p.action} fields=${JSON.stringify(p.fields)}`);
async function grant(policy, action) {
  const row = perms.find((x) => x.policy === policy && x.action === action);
  if (row) {
    const f = row.fields || [];
    if (f.includes("*") || NEW.every((n) => f.includes(n))) return log(`  ${policy.slice(0, 8)} ${action}: already ok`);
    const r = await api("PATCH", `/permissions/${row.id}`, { fields: [...new Set([...f, ...NEW])] });
    return log(`  ${policy.slice(0, 8)} ${action}: widened ->`, r.status);
  }
  const r = await api("POST", "/permissions", { policy, collection: C, action, fields: ["*"], permissions: {}, validation: {} });
  log(`  ${policy.slice(0, 8)} ${action}:`, r.ok ? "granted" : `FAIL ${r.status} ${r.text.slice(0, 160)}`);
}
for (const a of ["create", "read", "update"]) await grant(CW, a);
// Elke andere policy die al read had (build-rol, scoped writer): verbreden, niet nieuw toekennen.
for (const p of perms.filter((x) => x.action === "read" && x.policy !== CW)) await grant(p.policy, "read");
if (perms.some((x) => x.policy === CWS && x.action === "update")) await grant(CWS, "update");

const after = (await api("GET", `/fields/${C}?limit=-1`)).j.data.map((f) => f.field);
const missing = NEW.filter((n) => !after.includes(n));
log("velden na:", after.join(","));
if (missing.length) { console.error("ONTBREEKT:", missing.join(",")); process.exit(1); }
log("done", JSON.stringify(res));
