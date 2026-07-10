#!/usr/bin/env node
/**
 * Migration: gecureerde GetYourGuide-tours per streek (LAT-2252).
 *
 * Voegt één JSON-veld toe aan `streken`, gelezen door de streken-loader
 * (src/lib/streken.ts → parseGygTours) en gerenderd in TourCards.astro als de
 * "Tours en tickets in {streek}"-sectie:
 *   - gyg_tours   json, nullable  — array van { title, url, duration, blurb }.
 *
 * `url` = de kale, gecureerde getyourguide.com-tour-deeplink (ZONDER tracking).
 * partner_id=CRMZDZ6 + cmp=streek-<slug> worden pas op render-tijd toegevoegd
 * (decorateGyGTourUrl, affiliate-regio.ts). Zo blijft het CMS de bron van
 * waarheid voor de curatie en de code de bron voor de tracking-wrapper.
 *
 * De loader degradeert stil zolang het veld afwezig/leeg is (graceful degrade),
 * dus de site blijft bouwen zonder deze migratie — de sectie verschijnt zodra
 * het veld bestaat én gevuld is (zie directus/scripts/seed-gyg-tours.mjs voor
 * een voorstel-curatie).
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-login-token> \
 *       node directus/scripts/add-gyg-tours-field.mjs
 *
 * NB: gebruik een admin LOGIN-token (niet de statische build-token). Per LAT-1798
 * 403't de statische ADMIN_TOKEN op /fields; schema-writes vereisen een sessie-token.
 *
 * Idempotent: 409 / "already exists" bij field-create wordt overgeslagen.
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, text };
  if (res.status === 409 || /already exists/i.test(text) || /Field.*exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

const FIELDS = [
  {
    field: "gyg_tours",
    type: "json",
    meta: {
      interface: "list",
      special: ["cast-json"],
      width: "full",
      note: "Gecureerde GetYourGuide-tours (LAT-2252). Array van { title, url, duration, blurb }. url = kale getyourguide.com-deeplink zonder tracking; partner_id + cmp komen op render-tijd.",
      options: {
        fields: [
          { field: "title", type: "string", name: "Titel", meta: { interface: "input", width: "full", required: true } },
          { field: "url", type: "string", name: "GetYourGuide-URL (kaal)", meta: { interface: "input", width: "full", required: true, note: "Volledige getyourguide.com-tour-URL zonder tracking-params." } },
          { field: "duration", type: "string", name: "Duur", meta: { interface: "input", width: "half", note: "Bv. '4–5 uur' of 'Meerdaags (privé)'." } },
          { field: "blurb", type: "text", name: "Omschrijving", meta: { interface: "input-multiline", width: "full", note: "Korte reden waarom deze tour." } },
        ],
      },
    },
    schema: { is_nullable: true },
  },
];

async function createFields() {
  for (const field of FIELDS) {
    process.stdout.write(`  + streken.${field.field} ... `);
    const res = await api("POST", `/fields/streken`, field);
    if (res.alreadyExists) { console.log("already exists, skipping"); continue; }
    if (res.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
    process.exit(1);
  }
}

async function run() {
  console.log(`\nLAT-2252 migration: gyg_tours (json) op streken`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createFields();
  console.log(`\nDone. Vul de curatie per streek (of run directus/scripts/seed-gyg-tours.mjs voor het voorstel).`);
  console.log(`De "Tours en tickets"-sectie verschijnt zodra het veld gevuld is.`);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
