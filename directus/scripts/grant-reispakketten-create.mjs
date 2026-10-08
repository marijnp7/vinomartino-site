#!/usr/bin/env node
/**
 * LAT-12396 — content-writer policy krijgt `create` op `reispakketten` (approval 97fadb34).
 * Alleen create, geen delete. Validation dwingt status=draft af: publiceren blijft redactiewerk.
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

const CW = "6b7abca9-c8a1-42de-9374-71491806308e"; // content-writer (content-agent, seed-runner)
const C = "reispakketten";
const VALIDATION = { status: { _eq: "draft" } };

const pol = await api("GET", `/policies/${CW}?fields=id,name`);
if (!pol.ok) { console.error(`policy ${CW} niet gevonden: ${pol.status}`); process.exit(1); }
console.log(`policy ${pol.j.data.name}`);

const q = `/permissions?limit=-1&fields=id,action,fields,validation&filter[policy][_eq]=${CW}&filter[collection][_eq]=${C}`;
const rows = (await api("GET", q)).j.data;
console.log(`voor: ${rows.map((r) => r.action).sort().join(",") || "(geen)"}`);
const row = rows.find((r) => r.action === "create");
if (row) {
  console.log(`create bestaat al (id ${row.id}), validation=${JSON.stringify(row.validation)}`);
} else {
  const r = await api("POST", "/permissions", { policy: CW, collection: C, action: "create", fields: ["*"], permissions: {}, validation: VALIDATION });
  if (!r.ok) { console.error(`create FAIL ${r.status} ${r.text.slice(0, 200)}`); process.exit(1); }
  console.log(`create granted (id ${r.j.data.id})`);
}
const after = (await api("GET", q)).j.data;
console.log(`na: ${after.map((r) => r.action).sort().join(",")}`);
