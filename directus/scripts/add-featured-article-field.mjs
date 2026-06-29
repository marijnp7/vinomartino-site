#!/usr/bin/env node
/**
 * Migration: add `featured` (boolean) to the `articles` collection.
 *
 * Why: LAT-1611 — the board wants to set the homepage "Verhaal van de week"
 * themselves but had no place to do it. The homepage previously just used the
 * newest article. This boolean toggle, shown right on the article edit screen
 * with the Dutch label "Verhaal van de week", lets an editor mark exactly which
 * article is featured. The homepage (src/pages/index.astro) reads it: the most
 * recent article with featured=true wins, falling back to the newest article
 * when none is marked.
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-token> \
 *       node directus/scripts/add-featured-article-field.mjs
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

const featuredField = {
  field: "featured",
  type: "boolean",
  meta: {
    interface: "boolean",
    special: ["cast-boolean"],
    width: "half",
    note: "Toon dit artikel als 'Verhaal van de week' op de homepage. Bij meerdere aangevinkte artikelen wint het nieuwste; staat er geen aan, dan toont de homepage automatisch het nieuwste artikel.",
    display: "boolean",
    options: { label: "Verhaal van de week" },
  },
  schema: { default_value: false, is_nullable: false },
};

async function run() {
  console.log(`\nMigration: add articles.featured ("Verhaal van de week")`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  process.stdout.write(`  + articles.featured ... `);
  const res = await api("POST", "/fields/articles", featuredField);
  if (res.alreadyExists) { console.log("already exists, skipping"); return; }
  if (res.ok) { console.log("OK"); return; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  process.exit(1);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
