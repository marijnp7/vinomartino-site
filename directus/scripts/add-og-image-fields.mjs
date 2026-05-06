#!/usr/bin/env node
/**
 * Migration: add `og_image` (uuid, file-image) to streken / wijnhuizen / routes.
 *
 * Why: LAT-899 V1.0 release spec lists `og_image` as a required Directus field
 * separate from `hero_image`, so editors can override the social-share image
 * per page. Without it, the Astro SiteLayout used to fall back to a hardcoded
 * Unsplash URL when hero_image was empty, which LAT-898 forbids.
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-token> \
 *       node directus/scripts/add-og-image-fields.mjs
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

const ogImageField = {
  field: "og_image",
  type: "uuid",
  meta: {
    interface: "file-image",
    width: "full",
    note: "Optional Open Graph image override. Falls back to hero_image when empty.",
  },
  schema: { is_nullable: true },
};

async function ensureOgImage(collection) {
  process.stdout.write(`  + ${collection}.og_image ... `);
  const res = await api("POST", `/fields/${collection}`, ogImageField);
  if (res.alreadyExists) { console.log("already exists, skipping"); return "skipped"; }
  if (res.ok) { console.log("OK"); return "created"; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0,200)}`);
  return "error";
}

async function run() {
  console.log(`\nMigration: add og_image to streken / wijnhuizen / routes`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  const summary = {};
  for (const c of ["streken", "wijnhuizen", "routes"]) {
    summary[c] = await ensureOgImage(c);
  }
  console.log("\nSummary:", JSON.stringify(summary, null, 2));
  if (Object.values(summary).includes("error")) process.exit(1);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
