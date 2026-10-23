#!/usr/bin/env node
/**
 * LAT-14740 — `address` (string) op `wijnhuizen_translations`, zodat /en/wijnhuizen/<slug> het adres
 * toont zoals het huis het in het Engels schrijft, zonder NL-plaats- of landnaam ("Kaapstad", "Italië").
 * NL blijft `wijnhuizen.address`. Leeg EN-veld = de loader valt terug op het NL-adres (scalar overlay),
 * want de meeste adressen zijn taalneutraal; alleen adressen met een NL-exoniem krijgen een EN-waarde.
 * Permissies: content-writer create/read/update; elke andere read-rij met een veldlijst (build-rol)
 * wordt verbreed, anders 400't de EN-build op de translations-fetch.
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
const exists = (r) => r.status === 409 || /already exists|RECORD_NOT_UNIQUE|not unique/i.test(r.text);
const log = (...a) => console.log(...a);
const C = "wijnhuizen_translations";
const CW = "6b7abca9-c8a1-42de-9374-71491806308e";       // content-writer (content-agent, seed-runner)
const CWS = "28dee565-e9c6-4296-8371-353759bb0c43";      // content-writer-scoped (atelier / design)
const NEW = ["address"];

log("== field ==");
const r = await api("POST", `/fields/${C}`, {
  field: "address", type: "string",
  meta: { interface: "input", width: "full", note: "Adres in het Engels, zoals het huis het zelf schrijft (Cape Town, Italy). Leeg = NL-adres van wijnhuizen.address (LAT-14740)." },
  schema: { is_nullable: true, default_value: null, max_length: 255 },
});
log("  address:", r.ok ? "created" : exists(r) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
if (!r.ok && !exists(r)) process.exit(2);

log("== permissions ==");
const perms = (await api("GET", `/permissions?limit=-1&fields=id,policy,action,fields&filter[collection][_eq]=${C}`)).j.data;
for (const p of perms) log(`  voor: ${String(p.policy).slice(0, 8)} ${p.action} fields=${JSON.stringify(p.fields)}`);
async function grant(policy, action) {
  const row = perms.find((x) => x.policy === policy && x.action === action);
  if (row) {
    const f = row.fields || [];
    if (f.includes("*") || NEW.every((n) => f.includes(n))) return log(`  ${policy.slice(0, 8)} ${action}: already ok`);
    const w = await api("PATCH", `/permissions/${row.id}`, { fields: [...new Set([...f, ...NEW])] });
    return log(`  ${policy.slice(0, 8)} ${action}: widened ->`, w.status);
  }
  const w = await api("POST", "/permissions", { policy, collection: C, action, fields: ["*"], permissions: {}, validation: {} });
  log(`  ${policy.slice(0, 8)} ${action}:`, w.ok ? "granted" : `FAIL ${w.status} ${w.text.slice(0, 160)}`);
}
for (const a of ["create", "read", "update"]) await grant(CW, a);
for (const p of perms.filter((x) => x.action === "read" && x.policy !== CW)) await grant(p.policy, "read");
if (perms.some((x) => x.policy === CWS && x.action === "update")) await grant(CWS, "update");
const after = (await api("GET", `/fields/${C}?limit=-1`)).j.data.map((f) => f.field);
if (!after.includes("address")) { console.error("ONTBREEKT: address"); process.exit(1); }
log("done");
