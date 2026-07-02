#!/usr/bin/env node
/**
 * Migration + seed: two-tier authenticity model (LAT-1958, rules: LAT-1957).
 *
 * Adds to `streken` and `articles` (and `routes` as a cheap bonus):
 *   - zelf_gereisd  boolean, default false, NOT nullable  — drives the
 *                   "Zelf gereisd"-badge in the streek-hero / artikel-header.
 *   - bezoekjaar    integer, nullable                     — year the editor visited.
 *
 * It then SEEDS zelf_gereisd=true on the streken the board flagged as
 * self-travelled (see TRUE_MATCHERS). Every other streek keeps the default
 * false — including the explicit false-list (Douro, Etna, Wachau, Burgenland,
 * Jerez, Priorat, Puglia, Campania, Emilia-Romagna, Friuli, Sardegna, Pfalz,
 * Rhone), which is left untouched.
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-login-token> \
 *       node directus/scripts/add-zelf-gereisd-fields.mjs
 *
 * NB: use an admin LOGIN token (not the static build token). Per LAT-1798 the
 * static ADMIN_TOKEN 403's on /fields; schema writes need an admin session token.
 *
 * Idempotent: 409 / "already exists" on field-create is skipped; re-seeding just
 * re-sets the same booleans.
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

const zelfGereisdField = {
  field: "zelf_gereisd",
  type: "boolean",
  meta: {
    interface: "boolean",
    special: ["cast-boolean"],
    width: "half",
    note: "Heeft de redactie deze plek zelf bezocht? Toont de badge 'Zelf gereisd' (twee-tier authenticiteitsmodel, LAT-1957).",
    display: "boolean",
    options: { label: "Zelf gereisd" },
  },
  schema: { default_value: false, is_nullable: false },
};

const bezoekjaarField = {
  field: "bezoekjaar",
  type: "integer",
  meta: {
    interface: "input",
    width: "half",
    note: "Jaar van bezoek (optioneel). Wordt subtiel naast de 'Zelf gereisd'-badge getoond.",
    display: "raw",
    options: { min: 1900, max: 2100 },
  },
  schema: { is_nullable: true },
};

// Collections that get both fields. streken + articles are in scope (badge
// renders there); routes is the cheap "indien snel mee te nemen" bonus.
const COLLECTIONS = ["streken", "articles", "routes"];

// Streken the board flagged self-travelled → seed zelf_gereisd=true. Matched
// case-insensitively against slug + name so it survives slug-convention drift
// (e.g. `langhe`, `piemonte-italie`, `toscane-italie`). Everything else stays false.
const TRUE_MATCHERS = [
  /loire/i, /bourgogne/i, /champagne/i, /provence/i, /mosel/i,
  /langhe/i, /piemonte/i, /toscan/i,
  /stellenbosch/i, /franschhoek/i, /constantia/i, /paarl/i, /swartland/i, /hemel[- ]?en[- ]?aarde/i,
  /veneto/i, /trentino/i, /alto[- ]?adige/i, /s(ü|u)dtirol/i,
  /slowak/i, /slovak/i,
];

async function createFields() {
  for (const col of COLLECTIONS) {
    for (const field of [zelfGereisdField, bezoekjaarField]) {
      process.stdout.write(`  + ${col}.${field.field} ... `);
      const res = await api("POST", `/fields/${col}`, field);
      if (res.alreadyExists) { console.log("already exists, skipping"); continue; }
      if (res.ok) { console.log("OK"); continue; }
      console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
      // routes is best-effort; only hard-fail on streken/articles.
      if (col !== "routes") process.exit(1);
    }
  }
}

async function seedStreken() {
  console.log(`\nSeed: streken.zelf_gereisd=true voor zelf-gereisde streken\n`);
  const res = await api("GET", `/items/streken?limit=-1&fields=id,slug,name,zelf_gereisd`);
  if (!res.ok) { console.log(`FAIL fetching streken (${res.status}): ${res.text.slice(0,200)}`); process.exit(1); }
  const rows = JSON.parse(res.text).data || [];
  const matched = [];
  const untouched = [];
  for (const r of rows) {
    const hay = `${r.slug || ""} ${r.name || ""}`;
    const isTrue = TRUE_MATCHERS.some((re) => re.test(hay));
    if (isTrue) {
      const patch = await api("PATCH", `/items/streken/${r.id}`, { zelf_gereisd: true });
      if (!patch.ok) { console.log(`  ! ${r.slug}: PATCH failed (${patch.status})`); continue; }
      matched.push(r.slug || r.name);
    } else {
      untouched.push(r.slug || r.name);
    }
  }
  console.log(`  ✓ zelf_gereisd=true (${matched.length}): ${matched.sort().join(", ") || "(geen)"}`);
  console.log(`  · gelaten op false (${untouched.length}): ${untouched.sort().join(", ")}`);
}

async function run() {
  console.log(`\nLAT-1958 migration: zelf_gereisd + bezoekjaar`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createFields();
  await seedStreken();
  console.log(`\nDone. Verifieer badge op streek Langhe (true) en NIET op Douro (false).`);
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
