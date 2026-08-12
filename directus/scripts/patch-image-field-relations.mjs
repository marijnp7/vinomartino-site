#!/usr/bin/env node
/**
 * Patch existing image fields to be proper Directus file relations (LAT-944).
 *
 * Why: bootstrap-schema.mjs originally registered hero_image/og_image as
 * `type: uuid` + `interface: file-image` but WITHOUT `meta.special: ['file']`
 * and without a relations row. Result: the Directus admin opens a file
 * picker, but the selection never sticks because Directus does not treat
 * the field as a file-relation. Programmatic PATCHes (_archive/set-article-hero-images.mjs,
 * archived by LAT-2830) still worked because they write the UUID directly via REST.
 *
 * This script:
 *   1. PATCHes meta.special=['file'] + meta.display='image' on each field.
 *   2. POSTs a relations row binding {collection}.{field} to directus_files.
 *
 * Idempotent: skips a field/relation that is already correctly configured.
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-token> \
 *       node directus/scripts/patch-image-field-relations.mjs
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

// Mirror of every imageField() call in bootstrap-schema.mjs.
const TARGETS = [
  ["countries", "hero_image"],
  ["regions", "hero_image"],
  ["destinations", "hero_image"],
  ["itineraries", "hero_image"],
  ["articles", "hero_image"],
  ["themes", "hero_image"],
  ["attractions", "hero_image"],
  ["accommodations", "hero_image"],
  ["activities", "hero_image"],
  ["food_spots", "hero_image"],
  ["landen", "hero_image"],
  ["streken", "hero_image"],
  ["streken", "og_image"],
  ["wijnhuizen", "hero_image"],
  ["wijnhuizen", "og_image"],
  ["routes", "hero_image"],
  ["routes", "og_image"],
];

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leave as text */ }
  return { ok: res.ok, status: res.status, text, json };
}

async function getField(collection, field) {
  const res = await api("GET", `/fields/${collection}/${field}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /fields/${collection}/${field} → ${res.status}: ${res.text.slice(0, 200)}`);
  return res.json?.data || null;
}

async function patchFieldMeta(collection, field) {
  const current = await getField(collection, field);
  if (!current) {
    console.log(`  - ${collection}.${field}: field does not exist, skipping`);
    return "missing";
  }
  const special = current.meta?.special || [];
  const hasFile = Array.isArray(special) && special.includes("file");
  const hasImageDisplay = current.meta?.display === "image";
  if (hasFile && hasImageDisplay) {
    console.log(`  · ${collection}.${field}: meta already correct, skipping`);
    return "skipped-meta";
  }
  const nextSpecial = hasFile ? special : [...special, "file"];
  const body = { meta: { special: nextSpecial, display: "image" } };
  const res = await api("PATCH", `/fields/${collection}/${field}`, body);
  if (!res.ok) {
    console.log(`  ✗ ${collection}.${field}: PATCH failed (${res.status}): ${res.text.slice(0, 200)}`);
    return "error-meta";
  }
  console.log(`  ✓ ${collection}.${field}: meta patched (special=${JSON.stringify(nextSpecial)}, display=image)`);
  return "patched-meta";
}

async function ensureRelation(collection, field) {
  const list = await api(
    "GET",
    `/relations/${collection}/${field}`,
  );
  if (list.status === 200 && list.json?.data) {
    console.log(`  · ${collection}.${field}: relation already exists, skipping`);
    return "skipped-relation";
  }
  if (list.status !== 200 && list.status !== 404) {
    console.log(`  ! ${collection}.${field}: relation GET unexpected ${list.status}: ${list.text.slice(0, 200)}`);
  }
  const res = await api("POST", `/relations`, {
    collection,
    field,
    related_collection: "directus_files",
  });
  if (!res.ok) {
    if (/already exists/i.test(res.text) || res.status === 400) {
      console.log(`  · ${collection}.${field}: relation likely exists (${res.status}), continuing`);
      return "skipped-relation";
    }
    console.log(`  ✗ ${collection}.${field}: relation POST failed (${res.status}): ${res.text.slice(0, 200)}`);
    return "error-relation";
  }
  console.log(`  ✓ ${collection}.${field}: relation created → directus_files`);
  return "created-relation";
}

async function run() {
  console.log(`\nPatching image-field relations on ${DIRECTUS_URL}\n`);
  const summary = {};
  for (const [collection, field] of TARGETS) {
    const key = `${collection}.${field}`;
    summary[key] = {};
    summary[key].meta = await patchFieldMeta(collection, field);
    if (summary[key].meta === "missing") continue;
    summary[key].relation = await ensureRelation(collection, field);
  }
  console.log("\nSummary:");
  for (const [key, result] of Object.entries(summary)) {
    console.log(`  ${key}: ${JSON.stringify(result)}`);
  }
  const hasError = Object.values(summary).some(
    (r) => r.meta?.startsWith("error") || r.relation?.startsWith("error"),
  );
  if (hasError) {
    console.error("\nOne or more patches failed.");
    process.exit(1);
  }
  console.log("\nDone. Reload Directus admin and try selecting an image in the UI.");
}

run().catch((e) => { console.error("Patch failed:", e); process.exit(1); });
