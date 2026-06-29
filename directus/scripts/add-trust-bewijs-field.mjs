#!/usr/bin/env node
/**
 * Migration: add `trust_bewijs` (text) to the `articles`, `streken` and
 * `routes` collections.
 *
 * Why: LAT-1798 (under LAT-1783 trust-bewijs per pagina). Trust-evidence is
 * currently embedded by hand as an info-block inside the existing `body`
 * field. This adds a dedicated, optional field so editors can manage and
 * reuse the evidence cleanly per item, separate from the article prose.
 *
 * The field holds either Markdown or a JSON array of key/value pairs; a
 * multiline textarea handles both. Optional everywhere (nullable) — existing
 * items stay valid, so there are no breaking changes.
 *
 * Run (from VPS, with admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a   # for DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/add-trust-bewijs-field.mjs
 *
 * Idempotent: 409 (field already exists) is skipped silently, so re-runs are safe.
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required (must be an admin token)."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

const COLLECTIONS = ["articles", "streken", "routes"];

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

function trustBewijsField() {
  return {
    field: "trust_bewijs",
    type: "text",
    meta: {
      interface: "input-multiline",
      special: null,
      width: "full",
      note: "Optioneel. Specifiek trust-bewijs voor deze pagina (Markdown of JSON-array van key-value paren). Vervangt op termijn het handmatige info-block in de body.",
      display: "raw",
    },
    schema: { is_nullable: true },
  };
}

async function run() {
  console.log(`\nMigration: add trust_bewijs to ${COLLECTIONS.join(", ")}`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  let failed = false;
  for (const collection of COLLECTIONS) {
    process.stdout.write(`  + ${collection}.trust_bewijs ... `);
    const res = await api("POST", `/fields/${collection}`, trustBewijsField());
    if (res.alreadyExists) { console.log("already exists, skipping"); continue; }
    if (res.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log("\nDone. Verify in Directus UI and confirm the build/content read-token can read the new field.");
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
