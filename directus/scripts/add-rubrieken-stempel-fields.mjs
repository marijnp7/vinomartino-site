#!/usr/bin/env node
/**
 * Migration: rubriekenstelsel + visuele stempel op de `articles`-collectie.
 *
 * Why: LAT-2112 (VIS-STRAT-03, editorieel kader LAT-2014). Lead Editor definieerde
 * vier terugkerende rubrieken met eigen visuele stempel. Dit voegt de bijbehorende,
 * optionele velden toe zodat de redactie ze per artikel kan zetten:
 *
 *   - rubriek           select (De Route / Het Portret / Uit de kelder / Eerst dit boeken)
 *   - tier              select (1 of 2) — redactioneel gewicht, gezet bij final review
 *   - plaatsstempel     string — "BESTEMMING . MMM JJJJ" overlay op de Tier 1 header-foto
 *   - proefnotities     json (repeater) — "Uit de kelder"-kaarten (fles-first)
 *   - eerst_dit_boeken  json (repeater) — praktisch afsluitblok van reisartikelen
 *
 * Alle velden zijn optioneel/nullable → bestaande artikelen blijven geldig, geen
 * breaking change. De site-loader (src/lib/articles.ts) leest ze in een eigen
 * degradatie-tier: zolang dit script niet is gedraaid, bouwt de site gewoon door
 * zonder de nieuwe stempels.
 *
 * Run (op de VPS, met admin-token):
 *   set -a && source /root/vinomartino-site/.env && set +a   # voor DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/add-rubrieken-stempel-fields.mjs
 *
 * NB: dit vereist een admin-LOGIN-token — een statisch ADMIN_TOKEN geeft 403 op
 * /fields (zie LAT-1798). Na afloop: geef de build/content read-rol read-permissie
 * op de vijf nieuwe velden, anders degradeert de loader ze weg.
 *
 * Idempotent: 409 (veld bestaat al) wordt overgeslagen, dus her-runs zijn veilig.
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required (must be an admin token)."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const COLLECTION = "articles";

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 200 || res.status === 204) return { ok: true, status: res.status, text };
  if (res.status === 409 || /already exists/i.test(text) || /Field.*exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

const FIELDS = [
  {
    field: "rubriek",
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      options: { choices: [
        { text: "De Route", value: "de_route" },
        { text: "Het Portret", value: "het_portret" },
        { text: "Uit de kelder", value: "uit_de_kelder" },
        { text: "Eerst dit boeken", value: "eerst_dit_boeken" },
      ] },
      note: "Terugkerend rubriek-format (LAT-2014). Stuurt de rubriek-signatuur in de artikel-header.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "tier",
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      options: { choices: [
        { text: "Tier 1 (pillar / major cluster)", value: "1" },
        { text: "Tier 2 (cluster / quick item)", value: "2" },
      ] },
      note: "Redactioneel gewicht, toegekend door de Lead Editor bij final review (LAT-2014).",
    },
    schema: { is_nullable: true },
  },
  {
    field: "plaatsstempel",
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note: "Alleen Tier 1. Overlay op de header-foto in de vorm \"BESTEMMING . MMM JJJJ\" (bijv. SERRALUNGA D'ALBA . OKT 2025). Leeg = geen stempel.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "proefnotities",
    type: "json",
    meta: {
      interface: "list",
      width: "full",
      note: "\"Uit de kelder\"-kaarten: fles-first proefnotities. Per fles: wijnnaam, jaar, wijnmaker, appellation, gedronken in, prijs, notitie (twee zinnen), etiket-foto (URL).",
      options: { fields: [
        { field: "wijnnaam", name: "Wijnnaam", type: "string", meta: { interface: "input", width: "full", required: true } },
        { field: "jaar", name: "Jaar", type: "string", meta: { interface: "input", width: "half" } },
        { field: "wijnmaker", name: "Wijnmaker", type: "string", meta: { interface: "input", width: "half" } },
        { field: "appellation", name: "Appellation", type: "string", meta: { interface: "input", width: "half" } },
        { field: "gedronken_in", name: "Gedronken in", type: "string", meta: { interface: "input", width: "half" } },
        { field: "prijs", name: "Prijs (EUR XX)", type: "string", meta: { interface: "input", width: "half" } },
        { field: "notitie", name: "Notitie (twee zinnen)", type: "text", meta: { interface: "input-multiline", width: "full" } },
        { field: "etiket_foto", name: "Etiket-foto (URL)", type: "string", meta: { interface: "input", width: "full" } },
        { field: "etiket_foto_alt", name: "Etiket-foto alt-tekst", type: "string", meta: { interface: "input", width: "full" } },
      ] },
    },
    schema: { is_nullable: true },
  },
  {
    field: "eerst_dit_boeken",
    type: "json",
    meta: {
      interface: "list",
      width: "full",
      note: "Praktisch afsluitblok: per item een naam/categorie + concrete handeling met tijdshorizon (LAT-2014).",
      options: { fields: [
        { field: "naam", name: "Naam / categorie", type: "string", meta: { interface: "input", width: "full", required: true } },
        { field: "handeling", name: "Concrete handeling + tijdshorizon", type: "text", meta: { interface: "input-multiline", width: "full" } },
      ] },
    },
    schema: { is_nullable: true },
  },
];

async function run() {
  console.log(`\nMigration: rubriekenstelsel + visuele stempel op ${COLLECTION}`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  let failed = false;
  for (const field of FIELDS) {
    process.stdout.write(`  + ${COLLECTION}.${field.field} ... `);
    const res = await api("POST", `/fields/${COLLECTION}`, field);
    if (res.alreadyExists) { console.log("already exists, skipping"); continue; }
    if (res.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log("\nDone. Verifieer in de Directus UI en geef de build/content read-token read-permissie op de vijf nieuwe velden.");
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
