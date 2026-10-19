#!/usr/bin/env node
/**
 * Migration: interne outreach-velden op `accommodations` (LAT-13957).
 *
 *   contact_email        string  mailadres van de eigen site van het verblijf
 *   contact_email_bron   string  URL van de pagina waar dat adres staat
 *   website              string  eigen site van het verblijf
 *   perskit_url          string  openbare beeldbank / persvoorwaarden
 *   booking_hotel_id     string  Booking `b_hotel_id`, voor Stay22 `onlyhcids`
 *
 * Alle vijf nullable en INTERN: ze mogen niet in de publieke read-policy en
 * worden niet gerenderd (accommodaties-loader vraagt een expliciete veldlijst).
 * Staat de publieke read-permissie op `*`, dan zet dit script hem om naar de
 * expliciete lijst van alle bestaande velden behalve deze vijf, zodat het gedrag
 * voor bestaande velden gelijk blijft. Andere policies met een expliciete
 * veldlijst voor create/update (content-writer = seed-identiteit) krijgen de
 * vijf velden erbij; `*` blijft `*`.
 *
 * Run (schema-werk, dus --admin):
 *   /paperclip/scripts/directus-run-internal.sh --admin \
 *     --script directus/scripts/add-accommodation-outreach-fields.mjs -- --dry-run
 *
 * Idempotent: bestaande velden worden overgeslagen, permissies alleen
 * gePATCHt als er iets verandert.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY = process.argv.includes("--dry-run");
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required (admin)."); process.exit(1); }

const COLLECTION = "accommodations";
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return json?.data;
}

const NOTE = "Intern (outreach, LAT-13957). Niet publiek, niet gerenderd.";
const FIELDS = [
  { field: "contact_email", note: "Mailadres van de eigen site van het verblijf." },
  { field: "contact_email_bron", note: "URL van de pagina op de eigen site waar dat adres staat." },
  { field: "website", note: "Eigen site van het verblijf." },
  { field: "perskit_url", note: "Openbare beeldbank of persvoorwaarden (optioneel)." },
  { field: "booking_hotel_id", note: "Booking-hotel-ID (b_hotel_id) voor gecureerde Stay22-kaarten (onlyhcids)." },
].map(({ field, note }) => ({
  field,
  type: "string",
  meta: { interface: "input", width: "half", group: null, hidden: false, note: `${note} ${NOTE}` },
  schema: { is_nullable: true },
}));
const NEW = FIELDS.map((f) => f.field);

const existing = (await api("GET", `/fields/${COLLECTION}`)).map((f) => f.field);
for (const f of FIELDS) {
  if (existing.includes(f.field)) { console.log(`field ${f.field}: bestaat al, skip`); continue; }
  console.log(`field ${f.field}: ${DRY ? "zou aanmaken" : "aanmaken"}`);
  if (!DRY) await api("POST", `/fields/${COLLECTION}`, f);
}
const allFields = [...new Set([...existing, ...NEW])];

const policies = Object.fromEntries((await api("GET", "/policies?limit=-1&fields=id,name")).map((p) => [p.id, p.name]));
const perms = await api("GET", `/permissions?limit=-1&filter[collection][_eq]=${COLLECTION}&fields=id,policy,action,fields`);

for (const p of perms) {
  const name = p.policy ? policies[p.policy] ?? p.policy : "(public/null)";
  const isPublic = !p.policy || /public/i.test(name);
  const cur = p.fields ?? [];
  let next = cur;
  if (isPublic) {
    if (cur.includes("*")) next = allFields.filter((f) => !NEW.includes(f));
    else next = cur.filter((f) => !NEW.includes(f));
  } else if (["create", "update", "read"].includes(p.action) && !cur.includes("*")) {
    next = [...new Set([...cur, ...NEW])];
  }
  const changed = JSON.stringify([...cur].sort()) !== JSON.stringify([...next].sort());
  console.log(`perm ${p.id} ${name} ${p.action}: ${cur.includes("*") ? "*" : cur.length + " velden"}${changed ? ` -> ${next.length} velden${DRY ? " (dry)" : ""}` : " (ongewijzigd)"}`);
  if (changed && !DRY) await api("PATCH", `/permissions/${p.id}`, { fields: next });
}
console.log(DRY ? "dry-run klaar" : "klaar");
