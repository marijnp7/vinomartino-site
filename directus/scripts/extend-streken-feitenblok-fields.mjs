#!/usr/bin/env node
/**
 * Migration: streek-feitenblok "In het kort 2.0" fields (LAT-2009, VIS-BL-10).
 *
 * Adds three free-text fields to `streken`, read by the streken-loader
 * (src/lib/streken.ts) and rendered in StreekFeitenblok.astro:
 *   - best_season       string, nullable  — beste seizoen om te reizen (bv. "mei–oktober").
 *   - drive_days        string, nullable  — aantal rijdagen voor de route (bv. "3–4 dagen").
 *   - nearest_airport   string, nullable  — dichtstbijzijnd vliegveld (bv. "Turijn (TRN), 1u15").
 *
 * Content-only, geen seed: de redactie vult deze velden per streek in Directus.
 * De loader degradeert stil zolang de velden leeg/afwezig zijn (graceful degrade),
 * dus de site blijft bouwen zonder deze migratie — de nieuwe feitenblok-rijen
 * verschijnen zodra de velden bestaan én gevuld zijn. Druiven, aantal adressen en
 * de tier-badge renderen sowieso (afgeleid uit bestaande data).
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-login-token> \
 *       node directus/scripts/extend-streken-feitenblok-fields.mjs
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
    field: "best_season",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Beste seizoen om te reizen (bv. 'mei–oktober'). Feitenblok 'In het kort'.",
      display: "raw",
    },
    schema: { is_nullable: true },
  },
  {
    field: "drive_days",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Aantal rijdagen voor de route (bv. '3–4 dagen'). Feitenblok 'In het kort'.",
      display: "raw",
    },
    schema: { is_nullable: true },
  },
  {
    field: "nearest_airport",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Dichtstbijzijnd vliegveld (bv. 'Turijn (TRN), 1u15'). Feitenblok 'In het kort'.",
      display: "raw",
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
  console.log(`\nLAT-2009 migration: best_season + drive_days + nearest_airport op streken`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createFields();
  console.log(`\nDone. Vul de velden per streek in Directus; het feitenblok toont de rij zodra gevuld.`);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
