#!/usr/bin/env node
/**
 * LAT-13058 — policy `growth-reader-readonly` (LAT-11949) krijgt `read` op `site_events`
 * en `affiliate_commissions`. Alleen read, geen andere collecties of acties.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin). Idempotent.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
async function api(method, path, body) {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
  return { status: r.status, ok: r.ok, j, text };
}

const GR = "6d4d8d97-e570-440f-bffd-56435d9bb6c7"; // growth-reader-readonly
const COLS = ["site_events", "affiliate_commissions"];

const pol = await api("GET", `/policies/${GR}?fields=id,name,admin_access`);
if (!pol.ok) { console.error(`policy ${GR} niet gevonden: ${pol.status}`); process.exit(1); }
if (pol.j.data.admin_access) { console.error("policy heeft admin_access: stop"); process.exit(1); }
console.log(`policy ${pol.j.data.name}`);

const q = `/permissions?limit=-1&fields=id,collection,action&filter[policy][_eq]=${GR}`;
const before = (await api("GET", q)).j.data;
console.log(`voor: ${before.map((r) => `${r.collection}:${r.action}`).sort().join(",")}`);
for (const c of COLS) {
  const row = before.find((r) => r.collection === c && r.action === "read");
  if (row) { console.log(`${c} read bestaat al (id ${row.id})`); continue; }
  const r = await api("POST", "/permissions", { policy: GR, collection: c, action: "read", fields: ["*"], permissions: {}, validation: null });
  if (!r.ok) { console.error(`${c} FAIL ${r.status} ${r.text.slice(0, 200)}`); process.exit(1); }
  console.log(`${c} read granted (id ${r.j.data.id})`);
}
const after = (await api("GET", q)).j.data;
console.log(`na: ${after.map((r) => `${r.collection}:${r.action}`).sort().join(",")}`);
