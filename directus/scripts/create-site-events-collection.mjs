#!/usr/bin/env node
/**
 * LAT-11948: collectie `site_events`, cookieloze eigen eventmeting (vervangt Plausible).
 * Patroon zoals affiliate_clicks: public = create-only op een vaste veld-lijst,
 * dashboard_reader = read. accountability=null: geen directus_activity/revisions,
 * dus geen IP-adres in Directus. Idempotent.
 *
 * Run: directus-run-internal.sh --admin --script directus/scripts/create-site-events-collection.mjs
 */
const U = process.env.DIRECTUS_URL || "http://directus:8055";
const T = process.env.DIRECTUS_TOKEN;
if (!T) { console.error("DIRECTUS_TOKEN required (admin)."); process.exit(1); }
const C = "site_events";
const EVENTS = ["pageview", "cta_click", "newsletter_signup", "affiliate_in_view", "web_vital"];

async function api(method, path, body) {
  const r = await fetch(U + path, { method, headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}
const s = (field, note, extra = {}) => ({ field, type: "string", meta: { interface: "input", width: "half", note, ...extra }, schema: { is_nullable: true } });

const FIELDS = [
  { field: "ts", type: "timestamp", meta: { interface: "datetime", special: ["date-created"], readonly: true, note: "Servertijd (niet door de client te zetten)." }, schema: { is_nullable: false } },
  s("event", "pageview | cta_click | newsletter_signup | affiliate_in_view | web_vital"),
  s("cta_id", "Knop/blok-id (data-cta-id) of partner:plaatsing"),
  s("metric", "web_vital: LCP | INP | CLS"),
  { field: "value", type: "float", meta: { interface: "input", width: "half", note: "web_vital-waarde (LCP/INP ms, CLS score)" }, schema: { is_nullable: true } },
  s("path", "window.location.pathname"),
  s("page_type", "home|streek|artikel|wijnhuis|accommodatie|route|land|reispakket|brief|intern|overig"),
  s("lang", "nl | en"),
  s("referrer_host", "Alleen hostnaam, nooit volledige URL; leeg = intern of direct"),
  s("utm_source", ""), s("utm_medium", ""), s("utm_campaign", ""),
  s("session_hash", "sha256(tab-id + UTC-datum) eerste 16 hex; wisselt dagelijks, geen IP"),
  s("device_class", "LAT-12573: viewport-bucket mobile (<768) | tablet (<1024) | desktop"),
  s("conn_type", "LAT-12573: navigator.connection.effectiveType slow-2g|2g|3g|4g; leeg = niet ondersteund (Safari/Firefox)"),
  { field: "is_internal", type: "boolean", meta: { interface: "boolean", width: "half", note: "Eigen/agent/bot/niet-productieverkeer. Filter op false voor KPI's." }, schema: { is_nullable: false, default_value: false } },
];

const col = await api("GET", `/collections/${C}`);
if (col.status === 200) console.log("collection exists");
else {
  const r = await api("POST", "/collections", {
    collection: C,
    meta: { icon: "monitoring", note: "LAT-11948: cookieloze eigen eventmeting. Public create-only; Strategy leest via dashboard_reader.", hidden: false, singleton: false, accountability: null, sort_field: null },
    schema: {},
    fields: [{ field: "id", type: "uuid", meta: { special: ["uuid"], hidden: true, readonly: true, interface: "input" }, schema: { is_primary_key: true, is_nullable: false } }],
  });
  console.log("create collection", r.status, r.ok ? "" : r.text.slice(0, 300));
  if (!r.ok) process.exit(1);
}
for (const f of FIELDS) {
  const r = await api("POST", `/fields/${C}`, f);
  console.log("field", f.field, r.ok ? "OK" : /already exists|unique/i.test(r.text) ? "exists" : `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}
// accountability=null ook afdwingen als de collectie al bestond
console.log("accountability", (await api("PATCH", `/collections/${C}`, { meta: { accountability: null } })).status);

const pols = (await api("GET", "/policies?fields=id,name&limit=-1")).json.data;
const pub = pols.find((p) => p.name === "$t:public_label")?.id;
const rd = pols.find((p) => p.name === "dashboard_reader")?.id;
if (!pub || !rd) { console.error("public/dashboard_reader policy niet gevonden"); process.exit(1); }
const ensure = async (policy, action, extra) => {
  const ex = (await api("GET", `/permissions?filter[collection][_eq]=${C}&filter[action][_eq]=${action}&filter[policy][_eq]=${policy}`)).json.data;
  const body = { policy, collection: C, action, permissions: {}, validation: {}, presets: null, fields: ["*"], ...extra };
  const r = ex.length ? await api("PATCH", `/permissions/${ex[0].id}`, body) : await api("POST", "/permissions", body);
  console.log("perm", action, policy === pub ? "public" : "dashboard_reader", r.status);
};
await ensure(pub, "create", {
  fields: ["event", "cta_id", "metric", "value", "path", "page_type", "lang", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "session_hash", "device_class", "conn_type", "is_internal"],
  validation: { _and: [{ event: { _in: EVENTS } }, { path: { _nnull: true } }, { session_hash: { _nnull: true } }] },
});
await ensure(rd, "read", {});
