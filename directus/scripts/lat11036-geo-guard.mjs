#!/usr/bin/env node
// LAT-11036 — land/streek-koppeling-guard op articles-publish (beleid: EDITORIAL_FRAMEWORK.md §9.1).
// Idempotent: veld = skip als hij bestaat; flow wordt verwijderd en opnieuw aangemaakt.
// Run: directus-run-internal.sh --admin --script <dit bestand> -- [--no-test]
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (m, p, b) => {
  const r = await fetch(U + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t };
};
const FLOW_NAME = "Guard: land/streek-koppeling bij publish (articles)";
const FIELD = "geo_koppeling_uitzondering";

// 1. veld
const ex = await api("GET", `/fields/articles/${FIELD}`);
if (ex.s === 200) console.log("veld bestaat al");
else {
  const r = await api("POST", "/fields/articles", {
    field: FIELD, type: "boolean",
    meta: {
      interface: "boolean", special: ["cast-boolean"], width: "half", display: "boolean",
      options: { label: "Bewust geen land/streek-koppeling" },
      note: "Alleen voor rubrieken Routes & logistiek, Wijnkennis losjes uitgelegd en Proefnotities: zet aan als dit artikel bewust géén land/streek nodig heeft (EDITORIAL_FRAMEWORK §9.1). Heeft geen effect bij Regio-gidsen, Verborgen regio's en Huis-portretten.",
    },
    schema: { default_value: false, is_nullable: false },
  });
  console.log("veld aangemaakt", r.s, r.s >= 300 ? r.t : "");
  if (r.s >= 300) process.exit(1);
}

// 2. flow (oude weg, dan opnieuw)
const old = await api("GET", `/flows?filter[name][_eq]=${encodeURIComponent(FLOW_NAME)}&fields=id`);
for (const f of old.j?.data || []) {
  // operations verwijzen naar elkaar: eerst de root loskoppelen
  await api("PATCH", `/flows/${f.id}`, { operation: null });
  const ops = await api("GET", `/operations?filter[flow][_eq]=${f.id}&fields=id&limit=-1`);
  for (const o of ops.j?.data || []) await api("PATCH", `/operations/${o.id}`, { resolve: null, reject: null });
  for (const o of ops.j?.data || []) await api("DELETE", `/operations/${o.id}`);
  console.log("oude flow weg", (await api("DELETE", `/flows/${f.id}`)).s);
}

const INSPECT = `module.exports = async function(data){
  const t = data.$trigger || {};
  const p = t.payload || {};
  if (p.status !== 'published') return { skip: true };
  const keys = t.keys || (t.key ? [t.key] : []);
  const has = k => Object.prototype.hasOwnProperty.call(p, k);
  return { skip: false, keys, hasCategory: has('category'), category: p.category,
    hasUitz: has('geo_koppeling_uitzondering'), uitz: p.geo_koppeling_uitzondering,
    hasLanden: has('related_landen'), landen: p.related_landen,
    hasStreken: has('related_streken'), streken: p.related_streken };
}`;

const ENFORCE = `module.exports = async function(data){
  const i = data.inspect || {};
  const NO_EXC = ["regio-gidsen", "verborgen regio's", "huis-portretten"];
  const WITH_EXC = ["routes & logistiek", "wijnkennis losjes uitgelegd", "proefnotities"];
  const norm = v => String(v == null ? '' : v).replace(/[\\u2018\\u2019]/g, "'").trim().toLowerCase();
  const rows = i.keys && i.keys.length ? [].concat(data.read_current || []) : [{}];
  // na de wijziging: db-rijen min verwijderd plus aangemaakt; een array vervangt alles
  const after = (has, val, db) => {
    const cur = Array.isArray(db) ? db : [];
    if (!has) return cur.length;
    if (val == null) return 0;
    if (Array.isArray(val)) return val.length;
    const del = (val.delete || []).map(d => (d && typeof d === 'object') ? d.id : d);
    return cur.filter(r => del.indexOf(r && typeof r === 'object' ? r.id : r) < 0).length + (val.create || []).length;
  };
  const bad = [];
  for (const r of rows) {
    const cat = norm(i.hasCategory ? i.category : r.category);
    const noExc = NO_EXC.indexOf(cat) >= 0, withExc = WITH_EXC.indexOf(cat) >= 0;
    if (!noExc && !withExc) continue;
    const n = after(i.hasLanden, i.landen, r.related_landen) + after(i.hasStreken, i.streken, r.related_streken);
    if (n > 0) continue;
    const uitz = i.hasUitz ? i.uitz : r.geo_koppeling_uitzondering;
    if (withExc && uitz === true) continue;
    bad.push({ id: r.id, cat: i.hasCategory ? i.category : r.category, exc: withExc });
  }
  if (!bad.length) return { ok: true };
  const b = bad[0];
  throw new Error("GEBLOKKEERD: articles" + (b.id ? "/" + b.id : "") + " kan niet op published: rubriek '" + b.cat + "' vereist een land- of streek-koppeling (related_landen of related_streken) en beide zijn leeg. " +
    (b.exc ? "Bewust geen koppeling nodig? Zet 'geo_koppeling_uitzondering' aan. " : "Voor deze rubriek is geen uitzondering mogelijk. ") +
    "Beleid: EDITORIAL_FRAMEWORK.md §9.1, guard LAT-11036.");
}`;

const flow = (await api("POST", "/flows", {
  name: FLOW_NAME, icon: "public", status: "inactive", trigger: "event", accountability: "all",
  description: "LAT-11036: weigert published als category een land/streek-koppeling eist en beide leeg zijn.",
  options: { type: "filter", scope: ["items.create", "items.update"], collections: ["articles"] },
})).j.data;
console.log("flow", flow.id);
const mk = async o => { const r = await api("POST", "/operations", { flow: flow.id, ...o }); if (r.s >= 300) { console.error("op faalt", o.key, r.t); process.exit(1); } return r.j.data.id; };
const idThrow = await mk({ name: "Throw: geo-koppeling vereist", key: "throw_geo", type: "throw-error", position_x: 47, position_y: 1,
  options: { code: "GEO_KOPPELING_REQUIRED", status: "400", message: "{{enforce_geo.message}}" } });
const idLog = await mk({ name: "Log reden", key: "log_geo", type: "log", position_x: 33, position_y: 17,
  options: { message: "[LAT-11036 geo-guard] {{$last.message}}" }, resolve: idThrow });
const idEnforce = await mk({ name: "Enforce (geo)", key: "enforce_geo", type: "exec", position_x: 33, position_y: 1,
  options: { code: ENFORCE }, reject: idLog });
const idRead = await mk({ name: "Lees huidig item", key: "read_current", type: "item-read", position_x: 19, position_y: 1,
  options: { collection: "articles", key: "{{inspect.keys}}", permissions: "$full",
    query: { fields: ["id", "category", "geo_koppeling_uitzondering", "related_landen.id", "related_streken.id"] } },
  resolve: idEnforce });
const idNoop = await mk({ name: "Geen publish: doorlaten", key: "noop", type: "exec", position_x: 19, position_y: 17,
  options: { code: "module.exports = async function(){ return { ok: true, reason: 'geen publish-transitie' }; }" } });
const idCond = await mk({ name: "Publish-transitie?", key: "is_publish", type: "condition", position_x: 12, position_y: 1,
  options: { filter: { $last: { skip: { _eq: false } } } }, resolve: idRead, reject: idNoop });
const idInspect = await mk({ name: "Inspect payload", key: "inspect", type: "exec", position_x: 5, position_y: 1,
  options: { code: INSPECT }, resolve: idCond });
console.log("flow root", (await api("PATCH", `/flows/${flow.id}`, { operation: idInspect, status: "active" })).s);

// 3. artikel 116 = bewuste uitzondering
const a116 = await api("PATCH", "/items/articles/116", { [FIELD]: true });
console.log("artikel 116 uitzondering", a116.s, a116.s >= 300 ? a116.t : "");

if (process.argv.includes("--no-test")) process.exit(0);

// 4. red/green met wegwerpartikelen
await new Promise(r => setTimeout(r, 6000)); // FlowManager-reload is asynchroon
const heroId = (await api("GET", "/items/articles/116?fields=hero_image")).j?.data?.hero_image;
const landId = (await api("GET", "/items/landen?limit=1&fields=id")).j?.data?.[0]?.id;
const strekId = (await api("GET", "/items/streken?limit=1&fields=id")).j?.data?.[0]?.id;
console.log("fixtures hero/land/streek:", !!heroId, landId, strekId);
const made = [];
const mkA = async (cat, extra = {}) => {
  const r = await api("POST", "/items/articles", { title: "LAT-11036 test", slug: `lat11036-test-${made.length}-${Date.now()}`, status: "draft", category: cat, hero_image: heroId, ...extra });
  if (r.s >= 300) throw new Error("create faalt " + r.t);
  made.push(r.j.data.id); return r.j.data.id;
};
const res = [];
const t = (name, r, wantStatus, wantCode) => {
  const code = r.j?.errors?.[0]?.extensions?.code;
  const ok = r.s === wantStatus && (!wantCode || code === wantCode);
  res.push(ok); console.log(ok ? "PASS" : "FAIL", name, "->", r.s, code || "", ok ? "" : r.t.slice(0, 300));
  if (r.s === 400) console.log("     msg:", (r.j?.errors?.[0]?.message || "").slice(0, 200));
};
try {
  const pub = (id, extra = {}) => api("PATCH", `/items/articles/${id}`, { status: "published", ...extra });
  const back = id => api("PATCH", `/items/articles/${id}`, { status: "draft" });
  let id = await mkA("Regio-gidsen");
  t("A regio-gids leeg -> 400", await pub(id), 400, "GEO_KOPPELING_REQUIRED");
  t("B regio-gids leeg + uitzondering in payload -> 400 (geen ontsnapping)", await pub(id, { [FIELD]: true }), 400, "GEO_KOPPELING_REQUIRED");
  t("C regio-gids + land in payload -> 200", await pub(id, { related_landen: { create: [{ landen_id: landId }], update: [], delete: [] } }), 200);
  await back(id);
  t("D zelfde artikel, land al in db, alleen status -> 200 (db-pad)", await pub(id), 200);
  id = await mkA("Regio-gidsen", { related_streken: { create: [{ streken_id: strekId }], update: [], delete: [] } });
  t("E regio-gids aangemaakt met streek, publish -> 200", await pub(id), 200);
  id = await mkA("Proefnotities");
  t("F proefnotitie leeg -> 400", await pub(id), 400, "GEO_KOPPELING_REQUIRED");
  t("G proefnotitie leeg + uitzondering -> 200", await pub(id, { [FIELD]: true }), 200);
  await back(id);
  t("H uitzondering nu in db, alleen status -> 200", await pub(id), 200);
  id = await mkA("Wijnkennis losjes uitgelegd", { [FIELD]: true });
  t("I wijnkennis met uitzondering (db) -> 200", await pub(id), 200);
  id = await mkA("Wijn & tafel");
  t("J wijn & tafel leeg -> 200 (geen verplichting)", await pub(id), 200);
  id = await mkA("Huis-portretten");
  t("K huis-portret leeg -> 400", await pub(id), 400, "GEO_KOPPELING_REQUIRED");
  id = await mkA("Verborgen regio's");
  t("L verborgen regio leeg -> 400", await pub(id), 400, "GEO_KOPPELING_REQUIRED");
  id = await mkA("Routes & logistiek");
  t("M routes leeg -> 400", await pub(id), 400, "GEO_KOPPELING_REQUIRED");
  t("N routes: draft-save zonder publish -> 200", await api("PATCH", `/items/articles/${id}`, { title: "LAT-11036 test 2" }), 200);
  const nd = await api("POST", "/items/articles", { title: "LAT-11036 create-published", slug: `lat11036-cp-${Date.now()}`, status: "published", category: "Regio-gidsen", hero_image: heroId });
  if (nd.j?.data?.id) made.push(nd.j.data.id);
  t("O create direct als published, regio-gids leeg -> 400", nd, 400, "GEO_KOPPELING_REQUIRED");
} finally {
  for (const id of made) console.log("delete", id, (await api("DELETE", `/items/articles/${id}`)).s);
}
console.log(res.every(Boolean) ? "ALL PASS" : `FAILED ${res.filter(x => !x).length}/${res.length}`);
process.exit(res.every(Boolean) ? 0 : 1);
