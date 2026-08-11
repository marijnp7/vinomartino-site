#!/usr/bin/env node
/**
 * LAT-4942: (re)create the "Bordeaux zonder de drukte" article as a Directus draft.
 *
 * The original was lost with branch feat/lat-1843-ga4-consent (LAT-4936); the body
 * below is the R1-approved reconstruction from the LAT-4936 `article` document,
 * passed in as the --data JSON so the prose is never retyped here.
 *
 * Idempotent: if the slug already exists the script updates that item instead of
 * creating a second one, and it never touches `status` — the published transition
 * is directus-publish.sh's job, and it fails with a silent 500 while hero_image is
 * empty, so the hero is set separately (lat4942-set-hero.mjs) before publishing.
 *
 * Usage:
 *   directus-run-internal.sh --script directus/scripts/lat4942-create-draft.mjs \
 *                            --data   directus/data/lat4942-bordeaux.json -- --dry-run
 */

import { readFileSync } from "node:fs";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const dataPath = process.argv[2];
if (!dataPath) { console.error("usage: lat4942-create-draft.mjs <data.json> [--dry-run]"); process.exit(1); }
const DRY = process.argv.includes("--dry-run");

const payload = JSON.parse(readFileSync(dataPath, "utf8"));
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(path, init = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { headers, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${init.method || "GET"} ${path} :: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const { data: existing } = await api(
  `/items/articles?limit=-1&filter[slug][_eq]=${encodeURIComponent(payload.slug)}&fields=id,slug,status,title`,
);

if (DRY) {
  console.log(`[dry-run] existing items with slug ${payload.slug}: ${existing.length}`);
  console.log(`[dry-run] would ${existing.length ? `PATCH articles/${existing[0].id}` : "POST /items/articles"}`);
  for (const [k, v] of Object.entries(payload)) {
    console.log(`  ${k.padEnd(18)} ${typeof v === "string" && v.length > 100 ? `${v.slice(0, 100)}… (${v.length} chars)` : JSON.stringify(v)}`);
  }
  process.exit(0);
}

let item;
if (existing.length > 1) {
  console.error(`refusing: ${existing.length} items already carry slug ${payload.slug}`);
  process.exit(1);
} else if (existing.length === 1) {
  // Never re-assert status here: an already-published item must not be dragged
  // back to draft by a re-run of this script.
  const { status, ...rest } = payload;
  ({ data: item } = await api(`/items/articles/${existing[0].id}`, { method: "PATCH", body: JSON.stringify(rest) }));
  console.log(`updated existing articles/${item.id}`);
} else {
  ({ data: item } = await api("/items/articles", { method: "POST", body: JSON.stringify(payload) }));
  console.log(`created articles/${item.id}`);
}

const { data: check } = await api(
  `/items/articles/${item.id}?fields=id,slug,status,title,category,author,pub_date,hero_image,meta_title,meta_description`,
);
console.log(JSON.stringify(check, null, 2));
const { data: full } = await api(`/items/articles/${item.id}?fields=body,description`);
console.log(`body: ${full.body.length} chars, description: ${full.description.length} chars`);
console.log(`hero_image: ${check.hero_image ?? "(EMPTY — publish guard will 500 until this is set)"}`);
