#!/usr/bin/env node
/**
 * LAT-13386 — voegt de keuze `gesloten` toe aan `wijnhuizen.bezoek_type` (dropdown).
 * Directus dwingt de choices niet af in de API; dit is de redactie-UI. Idempotent.
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
if (choices.some((c) => c.value === "gesloten")) { console.log("gesloten: already present"); process.exit(0); }
const next = [...choices, { text: "gesloten", value: "gesloten" }];
const r = await api("PATCH", "/fields/wijnhuizen/bezoek_type", { meta: { options: { ...options, choices: next } } });
const after = (await api("GET", "/fields/wijnhuizen/bezoek_type")).j?.data?.meta?.options?.choices?.map((c) => c.value);
console.log("PATCH:", r.status, "choices:", JSON.stringify(after));
if (!after?.includes("gesloten")) process.exit(3);
