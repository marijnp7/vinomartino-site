#!/usr/bin/env node
/**
 * LAT-4942: import the hero for "Bordeaux zonder de drukte" and hang it on the draft.
 *
 * Why a new asset instead of something already in the DAM: the DAM holds exactly
 * one Bordeaux image (dam-464, a Pexels cellar tagged "Pauillac") and it is already
 * the published hero of the sibling En Primeur article. Pauillac is also the Médoc —
 * the left-bank grandeur this article is explicitly not about. The only public-domain
 * right-bank alternative on Commons is a 1900-1905 postcard, which is the wrong
 * register for a piece about what a traveller finds *this* season.
 *
 * So: Michael bx's 2013 photo of the village of Saint-Michel-de-Fronsac seen from
 * the vines — Fronsac, right bank, contemporary, and the same commune the article
 * opens in (Château Dalem). CC BY-SA 3.0, so attribution is mandatory: the matching
 * entry in src/lib/image-credits.ts must be on main before this article renders,
 * otherwise the hero goes live uncredited (LAT-1687/LAT-2427 rationale).
 *
 * Idempotent on filename_download: re-running finds the existing file instead of
 * uploading a second copy.
 *
 * Usage: directus-run-internal.sh --script directus/scripts/lat4942-import-hero.mjs [-- --dry-run]
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }
const DRY = process.argv.includes("--dry-run");

const SLUG = "bordeaux-rechterover-entre-deux-mers-na-de-krach";
const FILENAME = "lat4942-saint-michel-de-fronsac-vignes.jpg";
const COMMONS_FILE = "File:Vue du bourg de Saint-Michel de Fronsac depuis les vignes.jpg";
// Take Commons' own 2400px rendering rather than the 4096px/5.5 MB original: the
// widest hero the site serves is 2400, and CC BY-SA permits the derivative (unlike
// the ND-licensed Ribera hero, which may only be scaled mechanically — LAT-4804).
// The thumb URL is resolved through the API instead of hand-built, because the
// hand-built form 400s — Commons only serves the bucket sizes it has rendered.
const THUMB_WIDTH = 2400;
const DESCRIPTION_PAGE =
  "https://commons.wikimedia.org/wiki/File:Vue_du_bourg_de_Saint-Michel_de_Fronsac_depuis_les_vignes.jpg";
const TITLE = "Saint-Michel-de-Fronsac gezien vanuit de wijngaard (Fronsac, rechteroever Bordeaux)";
// The credit lives in the DAM record as well as in image-credits.ts, so an editor
// browsing Directus can see the obligation without reading the site source.
const DESCRIPTION =
  `Het dorp Saint-Michel-de-Fronsac gezien vanuit de wijngaarden, Fronsac, Gironde, Frankrijk (2013). ` +
  `© Michael bx / Wikimedia Commons — CC BY-SA 3.0 — ${DESCRIPTION_PAGE}. ` +
  `Attributie verplicht: zie src/lib/image-credits.ts (LAT-4942).`;

const auth = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };
async function api(path, init = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${init.method || "GET"} ${path} :: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// --- locate the draft --------------------------------------------------------
const { data: arts } = await api(
  `/items/articles?limit=-1&filter[slug][_eq]=${encodeURIComponent(SLUG)}&fields=id,slug,status,hero_image`,
);
if (arts.length !== 1) { console.error(`expected exactly 1 article for ${SLUG}, found ${arts.length}`); process.exit(1); }
const article = arts[0];
console.log(`article ${article.id} (${article.status}), hero_image=${article.hero_image ?? "(none)"}`);

// --- already imported? -------------------------------------------------------
const { data: found } = await api(
  `/files?limit=1&filter[filename_download][_eq]=${encodeURIComponent(FILENAME)}&fields=id,filename_download,width,height,filesize`,
);
let file = found[0] ?? null;

const UA = { "User-Agent": "VinoMartino/1.0 (LAT-4942; cto-agent@vinomartino.com)" };

// Commons rate-limits bursts with a plain-text 429, so back off rather than
// crashing on the JSON.parse of "You are making too many requests to the API."
async function commonsThumbUrl() {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    format: "json", formatversion: "2", action: "query", titles: COMMONS_FILE,
    prop: "imageinfo", iiprop: "url|size", iiurlwidth: String(THUMB_WIDTH),
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 6000 * attempt));
    const text = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })).text();
    try {
      const ii = JSON.parse(text).query.pages[0].imageinfo[0];
      console.log(`commons thumb ${ii.thumbwidth}x${ii.thumbheight} (original ${ii.width}x${ii.height})`);
      return ii.thumburl;
    } catch { console.log(`  commons retry ${attempt + 1}: ${text.slice(0, 60)}`); }
  }
  throw new Error("could not resolve the Commons thumb URL");
}

if (!file) {
  const res = await fetch(await commonsThumbUrl(), { headers: UA, signal: AbortSignal.timeout(60000) });
  if (!res.ok) { console.error(`commons download failed: ${res.status}`); process.exit(1); }
  const bytes = new Uint8Array(await res.arrayBuffer());
  console.log(`downloaded ${bytes.length} bytes from Commons`);

  if (DRY) { console.log(`[dry-run] would upload ${FILENAME} and set it as hero of articles/${article.id}`); process.exit(0); }

  const form = new FormData();
  form.append("title", TITLE);
  form.append("description", DESCRIPTION);
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), FILENAME);
  const up = await fetch(`${DIRECTUS_URL}/files`, { method: "POST", headers: auth, body: form });
  const upText = await up.text();
  if (!up.ok) { console.error(`upload failed: ${up.status} ${upText.slice(0, 400)}`); process.exit(1); }
  file = JSON.parse(upText).data;
  console.log(`uploaded file ${file.id} (${file.width}x${file.height}, ${file.filesize} bytes)`);
} else {
  console.log(`reusing existing file ${file.id} (${file.width}x${file.height})`);
  if (DRY) { console.log(`[dry-run] would set it as hero of articles/${article.id}`); process.exit(0); }
}

// --- attach ------------------------------------------------------------------
const { data: patched } = await api(`/items/articles/${article.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hero_image: file.id, hero_is_illustration: false }),
});
console.log(`articles/${patched.id}.hero_image = ${patched.hero_image}`);
console.log(`\nimage-credits.ts key to add: '${file.id}'`);
