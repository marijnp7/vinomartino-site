#!/usr/bin/env node
/**
 * LAT-12786 — Wijnhuis-portret 2.0: schema + permissions on `wijnhuizen`.
 * LAT-12804 — adds `waarom_hier` (string[]) and `faq` ([{vraag, antwoord}]).
 * Run (admin, schema work):
 *   /paperclip/scripts/directus-run-internal.sh --admin --script directus/scripts/add-wijnhuis-portret-fields.mjs
 * Idempotent: existing fields/collections/relations/permissions are skipped.
 *
 * Decisions (see LAT-12786 comment):
 *  - `opgericht` NOT created: `established` (integer) already exists and is read by the site.
 *  - `hectares` already existed as string (30 numeric values) -> converted in place to float, values verified.
 *  - `druiven`/`wijnen` are NEW JSON fields; legacy `grapes`/`wines` (string lists) stay untouched.
 *  - `routes` reuses the existing junction `routes_wijnhuizen` (no data migration).
 *  - All new fields nullable, no default except zelf_geweest=false.
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

const CW = "6b7abca9-c8a1-42de-9374-71491806308e";       // content-writer (content-agent, seed-runner)
const CWS = "28dee565-e9c6-4296-8371-353759bb0c43";      // content-writer-scoped (atelier / design)

const GROUP = "portret_20";
const nullOr = (f, rule) => ({ _or: [{ [f]: { _null: true } }, { [f]: rule }] });
const intRange = (f, a, b, note) => ({
  field: f, type: "integer",
  meta: { interface: "input", width: "half", group: GROUP, note,
    options: { min: a, max: b }, validation: nullOr(f, { _between: [a, b] }), validation_message: `${a}–${b}` },
  schema: { is_nullable: true, default_value: null },
});
const enumField = (f, vals, note) => ({
  field: f, type: "string",
  meta: { interface: "select-dropdown", width: "half", group: GROUP, note,
    options: { choices: vals.map((v) => ({ text: v, value: v })), allowOther: false },
    validation: nullOr(f, { _in: vals }), validation_message: `Een van: ${vals.join(", ")}` },
  schema: { is_nullable: true, default_value: null },
});
const jsonField = (f, iface, note, options) => ({
  field: f, type: "json",
  meta: { interface: iface, special: ["cast-json"], width: "full", group: GROUP, note, ...(options ? { options } : {}) },
  schema: { is_nullable: true, default_value: null },
});

const BODEM = ["leisteen", "kalk", "vulkanisch", "zand", "klei", "loess", "graniet", "overig"];
const BEZOEK = ["zonder_afspraak", "vinothek", "op_afspraak"];

const fields = [
  { field: GROUP, type: "alias", meta: { interface: "group-detail", special: ["alias", "no-data", "group"], width: "full",
      options: { start: "closed" }, note: "Wijnhuis-portret 2.0 (LAT-12769 / LAT-12786). Leeg veld = blok verborgen op de site." }, schema: null },
  intRange("eigenaar_generatie", 1, 30, "Generatie van de huidige eigenaar-familie (5 = vijfde generatie). Leeg = onbekend/geen familiebedrijf."),
  jsonField("topwijngaarden", "tags", "Lijst strings, bv. [\"Wehlener Sonnenuhr\",\"Graacher Himmelreich\"]."),
  jsonField("druiven", "list", "[{naam, pct}], pct 0–100, som ≤ 100 (niet door Directus afgedwongen; template klemt/valideert).",
    { template: "{{naam}} {{pct}}%", fields: [
      { field: "naam", name: "Druif", type: "string", meta: { interface: "input", width: "half" } },
      { field: "pct", name: "Aandeel %", type: "integer", meta: { interface: "input", width: "half", options: { min: 0, max: 100 } } } ] }),
  enumField("bodem", BODEM, "Dominante bodem (één waarde)."),
  intRange("max_helling_pct", 0, 100, "Steilste wijngaard in % helling."),
  intRange("stijl_zoet", 1, 5, "Stijl-schuifje: 1 = kurkdroog … 5 = zoet."),
  intRange("stijl_vol", 1, 5, "Stijl-schuifje: 1 = licht … 5 = vol."),
  intRange("stijl_bewaar", 1, 5, "Stijl-schuifje: 1 = nu drinken … 5 = lang bewaren."),
  intRange("prijsband", 1, 4, "Prijsindicatie huis: 1 = € … 4 = €€€€."),
  enumField("bezoek_type", BEZOEK, "Hoe je er proeft."),
  jsonField("talen", "tags", "ISO-639-1 codes, lowercase: [\"de\",\"en\",\"nl\"]."),
  jsonField("openingstijden", "input-code",
    "Object: sleutels ma,di,wo,do,vr,za,zo = array 'HH:MM-HH:MM' ([] = gesloten, sleutel afwezig = onbekend); optioneel 'opmerking' (string). Bv. {\"ma\":[],\"za\":[\"10:00-12:00\",\"14:00-17:00\"],\"opmerking\":\"alleen op afspraak\"}.",
    { language: "json" }),
  jsonField("proeverij", "input-code",
    "Object {prijs: number (EUR p.p.), duur: integer (minuten), taal: string[] (ISO-639-1), url: string (reserveren)}. Alle keys optioneel.", { language: "json" }),
  { field: "zelf_geweest", type: "boolean",
    meta: { interface: "boolean", special: ["cast-boolean"], width: "half", group: GROUP,
      note: "ALLEEN true als Marijn er echt was (tooncontract LAT-12769). Aan = badge 'Zelf geweest' + kader 'Onze ervaring'." },
    schema: { is_nullable: true, default_value: false } },
  { field: "onze_ervaring", type: "text",
    meta: { interface: "input-rich-text-md", width: "full", group: GROUP, note: "Ik-vorm, markdown. Alleen vullen als zelf_geweest = true. Niet vertaald (NL)." },
    schema: { is_nullable: true, default_value: null } },
  jsonField("wijnen", "list",
    "Max 3 items: [{naam, rol: instap|signature|splurge, prijsband 1–4, drinkvenster {van,tot} jaren (null = open), koop_url}]. Max 3 niet door Directus afgedwongen. Los van legacy `wines`.",
    { template: "{{rol}}: {{naam}}", fields: [
      { field: "naam", name: "Naam", type: "string", meta: { interface: "input", width: "half" } },
      { field: "rol", name: "Rol", type: "string", meta: { interface: "select-dropdown", width: "half",
          options: { choices: ["instap", "signature", "splurge"].map((v) => ({ text: v, value: v })) } } },
      { field: "prijsband", name: "Prijsband 1–4", type: "integer", meta: { interface: "input", width: "half", options: { min: 1, max: 4 } } },
      { field: "drinkvenster", name: "Drinkvenster", type: "json", meta: { interface: "input-code", width: "half", options: { language: "json" } } },
      { field: "koop_url", name: "Koop-URL", type: "string", meta: { interface: "input", width: "full" } } ] }),
  // LAT-12804: blok 3 "Waarom je hier heen gaat" + blok 10 "Snel antwoord" (FAQPage-markup)
  jsonField("waarom_hier", "tags", "Max 3 korte strings (blok 3 'Waarom je hier heen gaat'). Max 3 niet door Directus afgedwongen; template toont de eerste 3."),
  jsonField("faq", "list", "[{vraag, antwoord}] (blok 10 'Snel antwoord' + FAQPage-markup). Antwoord platte tekst, 1-3 zinnen.",
    { template: "{{vraag}}", fields: [
      { field: "vraag", name: "Vraag", type: "string", meta: { interface: "input", width: "full" } },
      { field: "antwoord", name: "Antwoord", type: "text", meta: { interface: "input-multiline", width: "full" } } ] }),
];

// --- M2M plumbing -----------------------------------------------------------
async function ensureCollection(name, note, extraFields) {
  const r = await api("POST", "/collections", { collection: name, meta: { hidden: true, icon: "link", note },
    schema: {}, fields: [{ field: "id", type: "integer", meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } }, ...extraFields] });
  log(`  collection ${name}:`, r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}
async function ensureRelation(rel) {
  const r = await api("POST", "/relations", rel);
  log(`  relation ${rel.collection}.${rel.field}:`, r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}

const created = {};
async function main() {
  log("== fields ==");
  for (const def of fields) {
    const r = await api("POST", "/fields/wijnhuizen", def);
    created[def.field] = r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 160)}`;
    log(`  ${def.field}:`, created[def.field]);
  }

  log("== hectares string -> float ==");
  const before = (await api("GET", "/items/wijnhuizen?limit=-1&fields=id,hectares&filter[hectares][_nnull]=true")).j.data;
  const cur = (await api("GET", "/fields/wijnhuizen/hectares")).j.data;
  if (cur.type === "float") log("  already float");
  else {
    const r = await api("PATCH", "/fields/wijnhuizen/hectares", { type: "float",
      meta: { interface: "input", note: "Hectares (float). Leeg = onbekend.", group: GROUP, options: { min: 0 } }, schema: { is_nullable: true } });
    log("  PATCH:", r.status);
    const after = (await api("GET", "/items/wijnhuizen?limit=-1&fields=id,hectares&filter[hectares][_nnull]=true")).j.data;
    const bad = before.filter((b) => { const a = after.find((x) => x.id === b.id); return !a || Number(a.hectares) !== Number(String(b.hectares).replace(",", ".")); });
    log(`  verified ${before.length} rows before / ${after.length} after, mismatches: ${bad.length}`);
    if (bad.length || before.length !== after.length) {
      log("  MISMATCH -> restoring string type + values"); await api("PATCH", "/fields/wijnhuizen/hectares", { type: "string" });
      for (const b of before) await api("PATCH", `/items/wijnhuizen/${b.id}`, { hectares: b.hectares });
      process.exit(2);
    }
  }
  // group existing portrait-relevant fields
  await api("PATCH", "/fields/wijnhuizen/established", { meta: { group: GROUP, note: "Oprichtingsjaar (in het template 'Sinds'). Hergebruikt i.p.v. nieuw veld `opgericht`." } });

  log("== M2M routes (existing junction routes_wijnhuizen) ==");
  let r = await api("POST", "/fields/wijnhuizen", { field: "routes", type: "alias",
    meta: { interface: "list-m2m", special: ["m2m"], group: GROUP, width: "full", note: "Routes waar dit huis op ligt (junction routes_wijnhuizen)." } });
  log("  alias routes:", r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
  r = await api("PATCH", "/relations/routes_wijnhuizen/wijnhuizen_id", { meta: { one_field: "routes", junction_field: "routes_id", sort_field: null } });
  log("  relation wijnhuizen_id:", r.status);
  r = await api("PATCH", "/relations/routes_wijnhuizen/routes_id", { meta: { junction_field: "wijnhuizen_id" } });
  log("  relation routes_id:", r.status);

  log("== M2M nabije_wijnhuizen (self) ==");
  await ensureCollection("wijnhuizen_nabij", "M2M self: wijnhuizen ↔ nabije wijnhuizen (gericht, niet symmetrisch)", [
    { field: "wijnhuizen_id", type: "integer", schema: {}, meta: { hidden: true } },
    { field: "nabij_id", type: "integer", schema: {}, meta: { hidden: true } },
    { field: "sort", type: "integer", schema: {}, meta: { hidden: true } } ]);
  await ensureRelation({ collection: "wijnhuizen_nabij", field: "wijnhuizen_id", related_collection: "wijnhuizen",
    meta: { one_field: "nabije_wijnhuizen", junction_field: "nabij_id", sort_field: "sort" }, schema: { on_delete: "CASCADE" } });
  await ensureRelation({ collection: "wijnhuizen_nabij", field: "nabij_id", related_collection: "wijnhuizen",
    meta: { one_field: null, junction_field: "wijnhuizen_id" }, schema: { on_delete: "CASCADE" } });

  log("== M2M afbeeldingen (files) ==");
  await ensureCollection("wijnhuizen_files", "M2M: wijnhuizen ↔ directus_files (extra beelden, volgorde via sort)", [
    { field: "wijnhuizen_id", type: "integer", schema: {}, meta: { hidden: true } },
    { field: "directus_files_id", type: "uuid", schema: {}, meta: { hidden: true } },
    { field: "sort", type: "integer", schema: {}, meta: { hidden: true } } ]);
  await ensureRelation({ collection: "wijnhuizen_files", field: "directus_files_id", related_collection: "directus_files",
    meta: { one_field: null, junction_field: "wijnhuizen_id" }, schema: { on_delete: "CASCADE" } });
  await ensureRelation({ collection: "wijnhuizen_files", field: "wijnhuizen_id", related_collection: "wijnhuizen",
    meta: { one_field: "afbeeldingen", junction_field: "directus_files_id", sort_field: "sort" }, schema: { on_delete: "CASCADE" } });

  // alias fields are normally created together with the relation's one_field; make sure they exist & are grouped
  for (const [f, iface] of [["nabije_wijnhuizen", "list-m2m"], ["afbeeldingen", "files"]]) {
    const cur = await api("GET", `/fields/wijnhuizen/${f}`);
    if (cur.ok) { await api("PATCH", `/fields/wijnhuizen/${f}`, { meta: { interface: iface, group: GROUP, width: "full" } }); log(`  ${f}: present`); }
    else {
      const c = await api("POST", "/fields/wijnhuizen", { field: f, type: "alias", meta: { interface: iface, special: ["m2m"], group: GROUP, width: "full" } });
      log(`  ${f}: alias`, c.ok ? "created" : `FAIL ${c.status} ${c.text.slice(0, 200)}`);
    }
  }

  log("== permissions ==");
  const NEW = [...fields.filter((f) => f.field !== GROUP).map((f) => f.field), "routes", "nabije_wijnhuizen", "afbeeldingen", "hectares", "established"];
  const perms = (await api("GET", "/permissions?limit=-1&fields=id,policy,collection,action,fields")).j.data;
  const has = (p, c, a) => perms.find((x) => x.policy === p && x.collection === c && x.action === a);
  async function grant(policy, collection, action, flds = ["*"]) {
    const row = has(policy, collection, action);
    if (row) {
      const wide = (row.fields || []).includes("*");
      if (wide || flds.every((f) => (row.fields || []).includes(f))) return log(`  ${policy.slice(0, 4)} ${collection}:${action} already ok`);
      const r = await api("PATCH", `/permissions/${row.id}`, { fields: [...new Set([...(row.fields || []), ...flds])] });
      return log(`  ${policy.slice(0, 4)} ${collection}:${action} widened ->`, r.status);
    }
    const r = await api("POST", "/permissions", { policy, collection, action, fields: flds, permissions: {}, validation: {} });
    log(`  ${policy.slice(0, 4)} ${collection}:${action} ->`, r.ok ? "granted" : `FAIL ${r.status} ${r.text.slice(0, 160)}`);
  }
  const JUNC = ["routes_wijnhuizen", "wijnhuizen_nabij", "wijnhuizen_files"];
  for (const c of JUNC) for (const a of ["create", "read", "update", "delete"]) await grant(CW, c, a);
  await grant(CW, "wijnhuizen", "read"); await grant(CW, "wijnhuizen", "update");      // fields ["*"] already: new fields included
  for (const c of JUNC) for (const a of ["create", "read", "update", "delete"]) await grant(CWS, c, a);
  await grant(CWS, "wijnhuizen", "read");
  await grant(CWS, "wijnhuizen", "update", NEW);                                       // field-restricted: only portret fields
  await grant(CWS, "directus_files", "read");
  await grant(CW, "directus_files", "read");
  log("done", JSON.stringify(created));
}
await main();
