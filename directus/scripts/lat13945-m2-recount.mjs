#!/usr/bin/env node
/**
 * LAT-13945 — onafhankelijke herhaling van M2 (feitenpakket §G3, venster B) naast
 * /paperclip/agents/strategy/meting/m-reconcile.mjs. ALLEEN LEZEN: uitsluitend GET, geen
 * writes, geen schemawijziging. Output: alleen aantallen, geen rijen, geen ids, geen paden.
 * Twee methodes: (1) server-side aggregate count met Directus-filters, (2) volledige fetch van
 * alleen de filtervelden en tellen in JS met de testdefinitie van m-reconcile.
 * Run: GHA lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const get = async (p) => {
  const r = await fetch(U + p, { headers: { authorization: `Bearer ${T}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${p.split("?")[0]}`);
  return (await r.json()).data;
};
const enc = (o) => encodeURIComponent(JSON.stringify(o));
const count = async (coll, filter) =>
  Number((await get(`/items/${coll}?aggregate[count]=*&filter=${enc(filter)}`))[0].count);

const W = { A_pre_QA: ["2026-09-29", "2026-10-10"], B_herstelweek: ["2026-10-10", "2026-10-17T08:00"] };
const isTestF = { _or: [
  { placement: { _starts_with: "lat12562-" } },
  { partner: { _eq: "test" } },
  { path: { _starts_with: "test/" } }, { path: { _starts_with: "lat12562-test/" } },
  { path: { _contains: "/test/" } }, { path: { _contains: "/lat12562-test/" } },
] };
const isTestJ = (x) => (x.placement != null && x.placement.startsWith("lat12562-")) || x.partner === "test" ||
  /(^|\/)(lat12562-)?test\//.test(x.path || "");

const out = { schema: {}, server: {}, js: {} };
const f = await get("/fields/affiliate_clicks/clicked_at");
out.schema.clicked_at_type = f.type;
out.schema.ac_totaal = await count("affiliate_clicks", {});
out.schema.se_totaal = await count("site_events", {});

for (const [k, [s, e]] of Object.entries(W)) {
  const win = { clicked_at: { _gte: s, _lt: e } };
  const ruw = await count("affiliate_clicks", win);
  const test = await count("affiliate_clicks", { _and: [win, isTestF] });
  const ts = { ts: { _gte: s, _lt: e } };
  const pv = { _and: [ts, { event: { _eq: "pageview" } }] };
  const pvExt = { _and: [pv, { is_internal: { _neq: true } }] };
  out.server[k] = {
    ruw, test, echt: ruw - test,
    pv_totaal: await count("site_events", pv),
    pv_intern: await count("site_events", { _and: [pv, { is_internal: { _eq: true } }] }),
    pv_extern: await count("site_events", pvExt),
    pv_extern_met_referrer: await count("site_events", { _and: [pvExt, { referrer_host: { _nnull: true } }, { referrer_host: { _nempty: true } }] }),
    cta_extern: await count("site_events", { _and: [ts, { event: { _eq: "cta_click" } }, { is_internal: { _neq: true } }] }),
  };
}

const ac = await get("/items/affiliate_clicks?limit=-1&fields=clicked_at,partner,placement,path");
const se = await get(`/items/site_events?limit=-1&fields=ts,event,is_internal,referrer_host&filter=${enc({ event: { _in: ["pageview", "cta_click"] } })}`);
out.js.ac_rows = ac.length; out.js.se_rows = se.length;
const ms = (v) => new Date(v.endsWith?.("Z") || /[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z").getTime();
for (const [k, [s, e]] of Object.entries(W)) {
  const S = ms(s), E = ms(e);
  const r = ac.filter((x) => { const t = ms(x.clicked_at); return t >= S && t < E; });
  const q = se.filter((x) => { const t = ms(x.ts); return t >= S && t < E; });
  const pv = q.filter((x) => x.event === "pageview");
  out.js[k] = {
    ruw: r.length, test: r.filter(isTestJ).length, echt: r.filter((x) => !isTestJ(x)).length,
    test_placement: r.filter((x) => x.placement?.startsWith("lat12562-")).length,
    test_partner: r.filter((x) => x.partner === "test").length,
    test_path: r.filter((x) => /(^|\/)(lat12562-)?test\//.test(x.path || "")).length,
    pv_totaal: pv.length, pv_intern: pv.filter((x) => x.is_internal).length,
    pv_extern: pv.filter((x) => !x.is_internal).length,
    pv_extern_met_referrer: pv.filter((x) => !x.is_internal && x.referrer_host).length,
    cta_extern: q.filter((x) => x.event === "cta_click" && !x.is_internal).length,
  };
}
console.log("LAT13945_RESULT " + JSON.stringify(out));
