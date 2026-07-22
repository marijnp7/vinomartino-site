#!/usr/bin/env node
/**
 * Migration + draft-seed: dedicated homepage kaart-blurb (LAT-2451, Marijn-besluit
 * Optie B 2026-07-14).
 *
 * Adds to `streken`:
 *   - card_blurb  string (varchar 160), nullable — korte kaart-copy (max 140) voor
 *                 de 6-8 uitgelichte hero-streken op de homepage. Los van
 *                 `description` (die elders intro/meta is, ~220-760 tekens).
 *
 * De homepage geeft card_blurb voorrang; is die leeg dan valt de tile terug op
 * zinsgrens-truncatie van `description`. Daarom breekt niets zolang het veld leeg is.
 *
 * SEED (idempotent, niet-destructief): voor de zelf-gereisde streken (die als eerste
 * op de homepage komen) waar card_blurb NOG LEEG is, zet dit een DRAFT gelijk aan de
 * eerste zin van description (≤140, woordgrens-cap). De Lead Editor verfijnt die copy
 * daarna in de CMS; bestaande card_blurb-waarden worden NOOIT overschreven.
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-login-token> \
 *       node directus/scripts/add-card-blurb-field.mjs
 *
 * NB: gebruik een admin LOGIN-token (niet de statische build-token). Per LAT-1798
 * 403't de statische ADMIN_TOKEN op /fields; schema-writes vragen een admin-sessie.
 *
 * Idempotent: 409 / "already exists" op field-create wordt overgeslagen; de seed
 * vult alleen lege card_blurb-velden.
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

const cardBlurbField = {
  field: "card_blurb",
  type: "string",
  meta: {
    interface: "input",
    width: "full",
    note: "Korte kaart-blurb (max 140 tekens) voor de homepage-hero-streken. Leeg = de homepage valt terug op de eerste zin van de beschrijving. (LAT-2451)",
    display: "raw",
    options: { placeholder: "Eén pakkende zin, max 140 tekens", trim: true },
  },
  // 160 i.p.v. 140 zodat een net-te-lange redactie-input niet hard door de DB wordt
  // geweigerd; de homepage kapt defensief op 140.
  schema: { max_length: 160, is_nullable: true },
};

// Eerste-zin-draft (spiegelt clampToSentence in src/pages/index.astro): eerste .!?
// vanaf teken 40 (zodat "St." niet vroeg afkapt); anders hele tekst; > max →
// woordgrens-cap met ellipsis.
function firstSentence(text, max = 140) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const re = /[.!?](?=\s|$)/g;
  let end = -1, m;
  while ((m = re.exec(clean)) !== null) {
    if (m.index >= 40) { end = m.index + 1; break; }
  }
  const sentence = end > 0 ? clean.slice(0, end).trim() : clean;
  if (sentence.length <= max) return sentence;
  const lastSpace = sentence.slice(0, max).lastIndexOf(" ");
  return `${sentence.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

async function createField() {
  process.stdout.write(`  + streken.card_blurb ... `);
  const res = await api("POST", `/fields/streken`, cardBlurbField);
  if (res.alreadyExists) { console.log("already exists, skipping"); return; }
  if (res.ok) { console.log("OK"); return; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  process.exit(1);
}

async function seedDrafts() {
  console.log(`\nSeed: card_blurb-draft voor zelf-gereisde streken met leeg veld\n`);
  const res = await api("GET", `/items/streken?limit=-1&fields=id,slug,name,description,zelf_gereisd,card_blurb`);
  if (!res.ok) { console.log(`FAIL fetching streken (${res.status}): ${res.text.slice(0,200)}`); process.exit(1); }
  const rows = JSON.parse(res.text).data || [];
  const filled = [];
  const skipped = [];
  for (const r of rows) {
    const already = (r.card_blurb || "").trim();
    if (!r.zelf_gereisd) continue;          // alleen de uitgelichte (zelf-gereisde) streken
    if (already) { skipped.push(r.slug || r.name); continue; } // nooit redactie-copy overschrijven
    const draft = firstSentence(r.description);
    if (!draft) continue;
    const patch = await api("PATCH", `/items/streken/${r.id}`, { card_blurb: draft });
    if (!patch.ok) { console.log(`  ! ${r.slug}: PATCH failed (${patch.status})`); continue; }
    filled.push(`${r.slug || r.name} (${draft.length})`);
  }
  console.log(`  ✓ draft gevuld (${filled.length}): ${filled.sort().join(", ") || "(geen)"}`);
  console.log(`  · al gevuld, ongemoeid gelaten (${skipped.length}): ${skipped.sort().join(", ") || "(geen)"}`);
}

async function run() {
  console.log(`\nLAT-2451 migration: streken.card_blurb`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createField();
  await seedDrafts();
  console.log(`\nDone. Lead Editor: verfijn de card_blurb-drafts (≤140) voor de uitgelichte streken.`);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
