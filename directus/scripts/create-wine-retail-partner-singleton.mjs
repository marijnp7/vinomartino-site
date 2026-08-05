#!/usr/bin/env node
/**
 * Migration: create the `wine_retail_partner` singleton (LAT-3493, vervolg op LAT-1780).
 *
 * Marijn wil de wijnretail-affiliateconfig in Directus, niet als hardcoded const
 * in `src/lib/wine-retail.ts`. Deze singleton is die config: Marketing vult hem in
 * zodra er een partner-ID binnen is (Grapedistrict/Daisycon staat nog dicht) en de
 * inline link op wijnhuis-portretten gaat live bij de eerstvolgende build — zonder
 * code-deploy.
 *
 * Contract met src/lib/wine-retail.ts (loadWineRetailPartner):
 *   - `actief` moet true zijn EN `naam` + `search_template` + `tracker_partner`
 *     moeten alle drie gevuld zijn, anders rendert er niets. Nooit een
 *     "coming soon" — dat is Martin-stem-beleid (plan 4b, LAT-1593).
 *   - `search_template` moet de letterlijke placeholder `{q}` bevatten; die wordt
 *     vervangen door de URL-encoded producentnaam.
 *
 * Spiegelt de read-permissies van `ui_strings` (een collectie die de SSG-build al
 * leest) op de nieuwe singleton, zodat het build/content-token hem kan lezen.
 *
 * Run (heeft een ADMIN-token nodig — de scoped seed-identiteit 403't op /collections):
 *   /paperclip/scripts/directus-run-internal.sh --admin \
 *     --script directus/scripts/create-wine-retail-partner-singleton.mjs
 *
 * Idempotent: bestaande collectie/velden/permissies worden overgeslagen, dus
 * herhaald draaien is veilig.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://directus:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error("DIRECTUS_TOKEN is required (admin token).");
  process.exit(1);
}

const COLLECTION = "wine_retail_partner";
const MIRROR_FROM = "ui_strings";
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const exists = res.status === 409 || /already exists|exists$/i.test(text) || /has to be unique/i.test(text);
  return { ok: res.status >= 200 && res.status < 300, status: res.status, text, exists };
}

const FIELDS = [
  {
    field: "id",
    type: "integer",
    meta: { hidden: true, interface: "input", readonly: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  },
  {
    field: "actief",
    type: "boolean",
    meta: {
      interface: "boolean",
      width: "full",
      note:
        "AAN = de affiliate-link verschijnt op wijnhuis-portretten. UIT (default) = er rendert niets. " +
        "Zet dit pas aan als het programma daadwerkelijk gecontracteerd is; de drie velden hieronder " +
        "moeten dan ook alle drie gevuld zijn, anders blijft de link weg.",
    },
    schema: { is_nullable: false, default_value: false },
  },
  {
    field: "naam",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Partner-naam zoals die in de CTA komt, bv. 'Grapedistrict'. Verschijnt letterlijk in de linktekst.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "search_template",
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note:
        "Affiliate-zoek-URL met de placeholder {q} op de plek van de zoekterm, bv. " +
        "https://www.example.nl/zoeken?q={q}&partner=12345 . Zonder {q} wordt de config genegeerd.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "tracker_partner",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note:
        "Partner-sleutel voor de cookieless click-tracker (data-affiliate-partner). Kleine letters, " +
        "geen spaties, bv. 'grapedistrict'. Hierop groepeert het KPI-dashboard de clicks.",
    },
    schema: { is_nullable: true },
  },
];

async function createCollection() {
  process.stdout.write(`  + collection ${COLLECTION} (singleton) ... `);
  const res = await api("POST", "/collections", {
    collection: COLLECTION,
    meta: {
      icon: "wine_bar",
      note: "Wijnretail-affiliateconfig (LAT-3493). Leeg/uit = geen link op wijnhuis-portretten.",
      hidden: false,
      singleton: true,
      sort_field: null,
    },
    schema: {},
    fields: [FIELDS[0]],
  });
  if (res.exists) { console.log("already exists, skipping"); return; }
  if (res.ok) { console.log("OK"); return; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 300)}`);
  process.exit(1);
}

async function addFields() {
  for (const f of FIELDS.slice(1)) {
    process.stdout.write(`  + ${COLLECTION}.${f.field} ... `);
    const res = await api("POST", `/fields/${COLLECTION}`, f);
    if (res.exists) { console.log("exists, skip"); continue; }
    if (res.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
    process.exit(1);
  }
}

async function mirrorReadPermissions() {
  // Elke read-permissie op ui_strings klonen naar de nieuwe singleton, zodat
  // dezelfde policies (incl. het SSG-build/content-token) hem kunnen lezen.
  const res = await api(
    "GET",
    `/permissions?filter[collection][_eq]=${MIRROR_FROM}&filter[action][_eq]=read&limit=-1`,
  );
  if (!res.ok) {
    console.log(`  ! kon ${MIRROR_FROM}-permissies niet lezen (${res.status}); mirror overgeslagen. Zet read-perm handmatig.`);
    return;
  }
  let perms = [];
  try { perms = JSON.parse(res.text).data || []; } catch { perms = []; }
  if (perms.length === 0) {
    console.log(`  ! geen read-permissies op ${MIRROR_FROM} gevonden om te spiegelen. Zet read-perm handmatig voor het build-token.`);
    return;
  }
  for (const p of perms) {
    const policyLabel = p.policy || "(public)";
    process.stdout.write(`  + read-perm clone policy=${policyLabel} ... `);
    const clone = {
      policy: p.policy,
      collection: COLLECTION,
      action: "read",
      permissions: p.permissions ?? {},
      validation: p.validation ?? {},
      presets: p.presets ?? null,
      fields: p.fields ?? ["*"],
    };
    const cr = await api("POST", "/permissions", clone);
    if (cr.exists) { console.log("exists, skip"); continue; }
    if (cr.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${cr.status}): ${cr.text.slice(0, 200)}`);
  }
}

async function seedEmptyRow() {
  // Een singleton zonder rij geeft `{data: {}}` op GET. De loader kan daar prima
  // mee overweg (→ null), maar met een rij ziet Marketing meteen een ingevuld
  // formulier in plaats van een lege state. Alle waarden blijven leeg + actief=false.
  process.stdout.write(`  + lege rij in ${COLLECTION} ... `);
  const cur = await api("GET", `/items/${COLLECTION}`);
  if (cur.ok) {
    let data = null;
    try { data = JSON.parse(cur.text).data; } catch { data = null; }
    if (data && typeof data === "object" && Object.keys(data).length > 0) {
      console.log("bestaat al, skip (waarden ongemoeid)");
      return;
    }
  }
  const cr = await api("PATCH", `/items/${COLLECTION}`, {
    actief: false,
    naam: null,
    search_template: null,
    tracker_partner: null,
  });
  if (cr.ok) { console.log("OK"); return; }
  console.log(`niet aangemaakt (${cr.status}): ${cr.text.slice(0, 200)} — niet fataal, Directus maakt de rij bij de eerste save.`);
}

async function run() {
  console.log(`\nCreate singleton ${COLLECTION}`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createCollection();
  await addFields();
  await mirrorReadPermissions();
  await seedEmptyRow();
  console.log(
    `\nKlaar. Controleer in de Directus-UI dat ${COLLECTION} als singleton verschijnt en dat het ` +
      `build/content-token hem kan lezen.`,
  );
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
