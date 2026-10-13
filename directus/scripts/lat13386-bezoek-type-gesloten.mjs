#!/usr/bin/env node
/**
 * LAT-13386 — voegt de keuze `gesloten` toe aan `wijnhuizen.bezoek_type` (dropdown).
 * Plus: permission-validaties op `wijnhuizen` met een `_in`-lijst voor bezoek_type
 * (live gezet, niet in de repo) krijgen `gesloten` erbij; anders geeft de API 400. Idempotent.
 * Run (admin): .github/workflows/lat12804-directus-schema-migrate.yml, script = deze file.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const cur = await api("GET", "/fields/wijnhuizen/bezoek_type");
if (cur.status !== 200) { console.error("GET field:", cur.status); process.exit(2); }
const options = cur.j.data.meta?.options ?? {};
const choices = options.choices ?? [];
const perms = (await api("GET", "/permissions?limit=-1&filter[collection][_eq]=wijnhuizen&fields=id,action,policy,validation")).j?.data ?? [];
const addIn = (v) => {
  if (Array.isArray(v)) return v.map(addIn);
  if (!v || typeof v !== "object") return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    o[k] = k === "_in" && Array.isArray(x) && x.includes("op_afspraak") && !x.includes("gesloten") ? [...x, "gesloten"] : addIn(x);
  }
  return o;
};
for (const p of perms) {
  if (!p.validation) continue;
  const next = addIn(p.validation);
  if (JSON.stringify(next) === JSON.stringify(p.validation)) continue;
  const r = await api("PATCH", `/permissions/${p.id}`, { validation: next });
  console.log(`permission ${p.id} (${p.action}, policy ${p.policy}):`, r.status);
  if (r.status !== 200) process.exit(4);
}
console.log(`permissions checked: ${perms.length}`);
const fv = cur.j.data.meta?.validation;
if (fv) {
  const next = addIn(fv);
  if (JSON.stringify(next) !== JSON.stringify(fv)) {
    const r = await api("PATCH", "/fields/wijnhuizen/bezoek_type", { meta: { validation: next } });
    console.log("field validation:", r.status);
    if (r.status !== 200) process.exit(5);
  } else console.log("field validation: unchanged");
} else console.log("field validation: none");
if (choices.some((c) => c.value === "gesloten")) { console.log("gesloten: already present"); process.exit(0); }
const next = [...choices, { text: "gesloten", value: "gesloten" }];
const r = await api("PATCH", "/fields/wijnhuizen/bezoek_type", { meta: { options: { ...options, choices: next } } });
const after = (await api("GET", "/fields/wijnhuizen/bezoek_type")).j?.data?.meta?.options?.choices?.map((c) => c.value);
console.log("PATCH:", r.status, "choices:", JSON.stringify(after));
if (!after?.includes("gesloten")) process.exit(3);
