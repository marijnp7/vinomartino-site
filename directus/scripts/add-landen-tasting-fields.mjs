#!/usr/bin/env node
/**
 * Migration: add `druiven` + `practical` (JSON) to the `landen` collection.
 *
 * Why: LAT-1760 (Italië-parity). The landen-template renders "Wat je hier
 * proeft" (proefprofiel/druiven) and "Voor je gaat" (praktische tips) from
 * these fields. Today they only exist as hardcoded showcase data for Italië,
 * so the other 6 landen can never show those sections. Adding the Directus
 * fields makes both sections data-driven for all 7 landen; the Astro loader
 * (src/lib/landen.ts, mapDruiven/mapPractical) already reads them.
 *
 * Shape (JSON array), matching src/lib/landen.ts LandDruif / LandPractical:
 *   druiven:   [{ "name": "Nebbiolo", "color": "rood|wit|rosé",
 *                 "description": "...", "wines": ["Barolo","Barbaresco"] }]
 *   practical: [{ "key": "Vliegen op", "value": "Milano Malpensa (MXP) ..." }]
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-token> \
 *       node directus/scripts/add-landen-tasting-fields.mjs
 *
 * IMPORTANT (perm-asymmetry, cf. LAT-897/LAT-1008): a freshly created field is
 * NOT automatically readable by the build/content role. After this runs, mirror
 * READ permission on landen.druiven + landen.practical to the build role (or run
 * mirror-content-read-permissions), otherwise loadLanden() degrades these two
 * fields away on HTTP 403 and the sections stay empty.
 *
 * Idempotent: 409 (field already exists) is skipped silently.
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
  if (res.status === 200 || res.status === 204) return { ok: true, status: res.status, text };
  if (res.status === 409 || /already exists/i.test(text) || /Field.*exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

const fields = [
  {
    field: "druiven",
    type: "json",
    meta: {
      interface: "list",
      special: ["cast-json"],
      width: "full",
      note: "Proefprofiel ('Wat je hier proeft'). Array van {name, color: rood|wit|rosé, description, wines: string[]}.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "practical",
    type: "json",
    meta: {
      interface: "list",
      special: ["cast-json"],
      width: "full",
      note: "Praktische tips ('Voor je gaat'). Array van {key, value}.",
    },
    schema: { is_nullable: true },
  },
];

async function ensureField(collection, def) {
  process.stdout.write(`  + ${collection}.${def.field} ... `);
  const res = await api("POST", `/fields/${collection}`, def);
  if (res.alreadyExists) { console.log("already exists, skipping"); return "skipped"; }
  if (res.ok) { console.log("OK"); return "created"; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return "error";
}

async function run() {
  console.log(`\nMigration: add druiven + practical (JSON) to landen`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  const summary = {};
  for (const def of fields) {
    summary[def.field] = await ensureField("landen", def);
  }
  console.log("\nSummary:", JSON.stringify(summary, null, 2));
  console.log(
    "\nNB: grant the build/content role READ on landen.druiven + landen.practical (perm-asymmetry).",
  );
  if (Object.values(summary).includes("error")) process.exit(1);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
