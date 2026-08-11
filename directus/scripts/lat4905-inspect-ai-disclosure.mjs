#!/usr/bin/env node
/**
 * LAT-4905 (read-only): find articles whose BODY still carries the hardcoded
 * "Beelden bij dit artikel zijn AI-gegenereerd" disclosure paragraph.
 *
 * Why: LAT-4804 put a real, rights-covered CC BY-ND photo on
 * /artikelen/ribera-del-duero-tempranillo-hoogte/, but the live page still ends
 * with that disclosure. The line is not template-rendered (it is not in the site
 * source) — it is stored prose in the Directus `body`, left over from the AI
 * hero that LAT-4756 removed. On an article with a real photo the sentence is
 * simply false, and it undercuts the CC BY-ND credit right above it.
 *
 * This script only reports. It scopes the population instead of trusting the
 * one URL named in the ticket: an article is a FIX candidate when it has the
 * disclosure AND its hero file is not flagged synthetic.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };

// Same signal the site build uses to decide "is this file an AI render"
// (LAT-4776, SYNTHETIC_META_RE). Kept deliberately loose here: this script only
// classifies candidates for a human-readable report, it does not gate anything.
const SYNTHETIC_RE = /\b(ai[-\s]?render|ai[-\s]?gegenereerd|ai[-\s]?generated|gpt-image|midjourney|dall[-\s]?e|stable[-\s]?diffusion|synthetisch|synthetic)\b/i;
const DISCLOSURE_RE = /Beelden bij dit artikel zijn AI-gegenereerd/i;

async function api(path) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path} :: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const { data: articles } = await api(
  "/items/articles?limit=-1&fields=id,slug,title,status,hero_image",
);
const { data: files } = await api(
  "/files?limit=-1&fields=id,title,description,tags,filename_download",
);
const fileById = new Map(files.map((f) => [f.id, f]));

function isSyntheticFile(id) {
  const f = id && fileById.get(id);
  if (!f) return null; // no hero at all -> unknown, report separately
  const hay = [f.title, f.description, Array.isArray(f.tags) ? f.tags.join(" ") : f.tags, f.filename_download]
    .filter(Boolean).join(" ");
  return SYNTHETIC_RE.test(hay);
}

const hits = [];
for (const a of articles) {
  const { data: full } = await api(`/items/articles/${a.id}?fields=id,slug,body`);
  if (!DISCLOSURE_RE.test(full.body || "")) continue;
  hits.push({
    id: a.id,
    slug: a.slug,
    status: a.status,
    hero: a.hero_image || null,
    synthetic: a.hero_image ? isSyntheticFile(a.hero_image) : null,
  });
}

console.log(`articles scanned: ${articles.length}`);
console.log(`articles carrying the AI-disclosure paragraph: ${hits.length}\n`);
for (const h of hits) {
  const verdict = h.hero === null
    ? "no hero (disclosure is orphaned)"
    : h.synthetic
      ? "hero IS flagged synthetic -> disclosure is correct, leave alone"
      : "hero is a REAL photo -> disclosure is FALSE, fix candidate";
  console.log(`  articles/${h.id}  ${h.slug}`);
  console.log(`      status=${h.status} hero=${h.hero || "(none)"} => ${verdict}`);
}
