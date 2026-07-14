#!/usr/bin/env node
/**
 * Migration + seed: add `hero_credit` (JSON) to the `streken` collection and
 * populate the six replacement streek-hero's with their CC/PD attribution.
 *
 * Why: LAT-2427. Five of the six replacement hero's from LAT-2383/LAT-2387 are
 * CC BY / CC BY-SA and therefore require visible attribution (photographer +
 * licence + source link). The site renders that on-page from this Directus
 * field (source of truth, not hardcoded). The hero-credit-guard fails closed:
 * a CC hero without a complete credit is not rendered at all, so this seed must
 * run BEFORE (or together with) the deploy that ships the guard — otherwise the
 * five CC hero's blank out until the field is filled.
 *
 * Run (from VPS, with admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a   # for DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/add-hero-credit-field.mjs
 *
 * Idempotent: field-exists (409) is skipped; the seed PATCHes by slug and can
 * be re-run safely (it just re-writes the same JSON).
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required (must be an admin token)."); process.exit(1); }

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

function heroCreditField() {
  return {
    field: "hero_credit",
    type: "json",
    meta: {
      interface: "input-code",
      options: { language: "json" },
      special: ["cast-json"],
      width: "full",
      note: "Optioneel. Beeldcredit voor de hero: JSON-object {author, license_label, license_url, source_url}. Verplicht bij CC BY/BY-SA beelden — zonder complete credit weigert de hero-credit-guard het beeld (fail-closed).",
      display: "raw",
    },
    schema: { is_nullable: true },
  };
}

// LAT-2427 — provenance uit LAT-2383 (Wikimedia Commons). Gesleuteld op slug.
const CREDITS = {
  "rioja": {
    author: "Ken Case",
    license_label: "Publiek domein",
    license_url: "https://creativecommons.org/publicdomain/mark/1.0/",
    source_url: "https://commons.wikimedia.org/wiki/File:Rioja_vineyards.JPG",
  },
  "rias-baixas": {
    author: "jacilluch",
    license_label: "CC BY-SA 2.0",
    license_url: "https://creativecommons.org/licenses/by-sa/2.0/",
    source_url: "https://commons.wikimedia.org/wiki/File:RUTA_DEL_VINO_EN_AS_RIAS_BAIXAS_(6314679972).jpg",
  },
  "ribera-del-duero": {
    author: "Pravdaverita",
    license_label: "CC BY 3.0",
    license_url: "https://creativecommons.org/licenses/by/3.0/",
    source_url: "https://commons.wikimedia.org/wiki/File:Vi%C3%B1edos_Bodega_Vi%C3%B1a_Sastre_-_Hermanos_Sastre_Ribera_del_Duero.JPG",
  },
  "alentejo": {
    author: "Celestino Manuel",
    license_label: "CC BY 2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0/",
    source_url: "https://commons.wikimedia.org/wiki/File:ALENTEJO_-_VINHAS_NO_OUTONO_-_I_(4091248252).jpg",
  },
  "vinho-verde": {
    author: "alexandra vale",
    license_label: "CC BY 2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0/",
    source_url: "https://commons.wikimedia.org/wiki/File:Minho_Vinho_Verde_Vineyards.jpg",
  },
  "rhone": {
    author: "Ed Clayton",
    license_label: "CC BY 2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0/",
    source_url: "https://commons.wikimedia.org/wiki/File:Jeunes_vignes_des_comt%C3%A9s-rhodaniens_en_Ard%C3%A8che.jpg",
  },
};

async function findStreekIdBySlug(slug) {
  const res = await fetch(`${DIRECTUS_URL}/items/streken?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id,slug&limit=1`, { headers });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  const row = (json.data || [])[0];
  return row ? row.id : null;
}

async function run() {
  console.log(`\nMigration: add streken.hero_credit + seed 6 credits`);
  console.log(`Target: ${DIRECTUS_URL}\n`);

  process.stdout.write(`  + streken.hero_credit ... `);
  const fieldRes = await api("POST", `/fields/streken`, heroCreditField());
  if (fieldRes.alreadyExists) console.log("already exists, skipping");
  else if (fieldRes.ok) console.log("OK");
  else { console.log(`FAIL (${fieldRes.status}): ${fieldRes.text.slice(0, 200)}`); process.exit(1); }

  console.log(`\n  Seeding credits:`);
  let failed = false;
  for (const [slug, credit] of Object.entries(CREDITS)) {
    process.stdout.write(`    ~ ${slug} ... `);
    const id = await findStreekIdBySlug(slug);
    if (!id) { console.log("streek not found, SKIP"); failed = true; continue; }
    const res = await api("PATCH", `/items/streken/${id}`, { hero_credit: credit });
    if (res.ok) console.log(`OK (${credit.license_label})`);
    else { console.log(`FAIL (${res.status}): ${res.text.slice(0, 160)}`); failed = true; }
  }

  if (failed) { console.log(`\nDone with errors — check the streken that were skipped/failed.`); process.exit(1); }
  console.log(`\nDone. Verify streken.hero_credit is readable by the build/content token, then rebuild/deploy.`);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
