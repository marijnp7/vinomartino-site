#!/usr/bin/env node
/**
 * LAT-13213: bewaartermijn 12 maanden voor `site_events` en `affiliate_clicks`
 * (privacyverklaring NL/EN, LAT-13201). Idempotent: maakt of herstelt één
 * Directus-flow met schedule-trigger (dagelijks 03:30 UTC): een exec-op die de
 * grens berekent (nu - 365 dagen, ISO) en twee item-delete-operaties op query:
 *   site_events       ts         < {{cutoff.iso}}
 *   affiliate_clicks  clicked_at < {{cutoff.iso}}
 * (Grens via exec + mustache i.p.v. $NOW(): geen afhankelijkheid van of
 * item-delete dynamische filtervariabelen resolvet.)
 * Draait in Directus' eigen scheduler; geen nieuwe GHA-cron, geen board-routine.
 * Print vooraf per collectie alleen aantallen (totaal, ouder dan 12 mnd, oudste).
 * Rollback: zet de flow op status "inactive" of verwijder hem (id in output).
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const NAME = "LAT-13213 retentie 12 maanden (site_events, affiliate_clicks)";
const CRON = "30 3 * * *";
const TARGETS = [
  { key: "purge_site_events", collection: "site_events", field: "ts" },
  { key: "purge_affiliate_clicks", collection: "affiliate_clicks", field: "clicked_at" },
];
async function api(method, path, body) {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${method} ${path.split("?")[0]}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t).data : null;
}
const q = (o) => encodeURIComponent(JSON.stringify(o));
const cutoff = new Date(Date.now() - 365 * 864e5).toISOString();
for (const t of TARGETS) {
  const all = await api("GET", `/items/${t.collection}?aggregate[count]=*&aggregate[min]=${t.field}`);
  const old = await api("GET", `/items/${t.collection}?aggregate[count]=*&filter=${q({ [t.field]: { _lt: cutoff } })}`);
  console.log(`[lat13213] ${t.collection}: totaal=${all[0].count} ouder_dan_12m=${old[0].count} oudste=${all[0].min?.[t.field] ?? "?"}`);
}
const opOptions = (t) => ({
  collection: t.collection,
  permissions: "$full",
  emitEvents: false,
  query: { filter: { [t.field]: { _lt: "{{cutoff.iso}}" } }, limit: -1 },
});
let flow = (await api("GET", `/flows?filter=${q({ name: { _eq: NAME } })}&fields=id,status,operation,options`))[0];
const flowBody = { name: NAME, icon: "auto_delete", status: "active", trigger: "schedule", accountability: null, options: { cron: CRON },
  description: "Bewaartermijn privacyverklaring (LAT-13201/LAT-13213). Beheer via directus/scripts/lat13213-retention-flow.mjs." };
if (!flow) flow = await api("POST", "/flows", flowBody);
else await api("PATCH", `/flows/${flow.id}`, flowBody);
const ops = await api("GET", `/operations?filter=${q({ flow: { _eq: flow.id } })}&fields=id,key,resolve`);
const byKey = Object.fromEntries(ops.map((o) => [o.key, o]));
// Bouw de keten van achter naar voren: tweede op eerst, zodat resolve kan wijzen.
let next = null;
for (const [i, t] of [...TARGETS.entries()].reverse()) {
  const body = { name: `Purge ${t.collection} > 12 mnd`, key: t.key, type: "item-delete", position_x: 19 + i * 18, position_y: 1,
    options: opOptions(t), resolve: next, reject: null, flow: flow.id };
  const cur = byKey[t.key];
  next = cur ? (await api("PATCH", `/operations/${cur.id}`, body)).id : (await api("POST", "/operations", body)).id;
}
const cutBody = { name: "Grens: nu - 365 dagen", key: "cutoff", type: "exec", position_x: 1, position_y: 1, flow: flow.id, reject: null, resolve: next,
  options: { code: "module.exports = async function () { return { iso: new Date(Date.now() - 365 * 864e5).toISOString() }; };" } };
next = byKey.cutoff ? (await api("PATCH", `/operations/${byKey.cutoff.id}`, cutBody)).id : (await api("POST", "/operations", cutBody)).id;
await api("PATCH", `/flows/${flow.id}`, { operation: next });
const check = await api("GET", `/flows/${flow.id}?fields=id,status,trigger,options,operation`);
console.log(`[lat13213] flow ${check.id} status=${check.status} trigger=${check.trigger} cron=${check.options?.cron} eerste_op=${check.operation}`);
