#!/usr/bin/env node
/**
 * LAT-13914 — maker in de herkomst van de Castiglione Falletto-hero (article 72, DAM RS1820).
 * Commons noemt "Christoph Strässler" (Artist, via Flickr 78904630@N08/42852960604), licentie CC BY-SA 2.0.
 * Vervangt alleen de "Credit: ..."-regel in `herkomst` door de canonieke vorm en zet `description` gelijk;
 * de overige herkomstregels (slug, keywords) blijven staan. Idempotent; print readback.
 * Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const ID = "82da24ec-2d30-477a-8e7c-4012b4d4c99a";
const BRON = "https://commons.wikimedia.org/wiki/File:Castiglione_Falletto,_Piemonte,_Italy.jpg";
const CREDIT = `Foto: Christoph Strässler, CC BY-SA 2.0, via Wikimedia Commons. Bron: ${BRON}`;
const DESCRIPTION = `Christoph Strässler (Flickr) via Wikimedia Commons — CC BY-SA 2.0 — bron: ${BRON} (DAM RS1820)`;
const FIELDS = "id,licentie,herkomst,description";

const b = await api("GET", `/files/${ID}?fields=${FIELDS}`);
if (b.status !== 200) { console.error("GET", ID, b.status); process.exit(2); }
if (b.j.data.licentie !== "cc-by-sa-2.0") { console.error("licentie onverwacht:", b.j.data.licentie); process.exit(3); }
const cur = String(b.j.data.herkomst ?? "");
let herkomst;
if (cur.includes(CREDIT)) herkomst = cur;
else if (/^Credit:.*$/m.test(cur)) herkomst = cur.replace(/^Credit:.*$/m, CREDIT);
else herkomst = cur ? `${cur.replace(/\s+$/, "")}\n${CREDIT}` : CREDIT;
const want = { herkomst, description: DESCRIPTION };
if (b.j.data.herkomst !== want.herkomst || b.j.data.description !== want.description) {
  const p = await api("PATCH", `/files/${ID}`, want);
  if (p.status !== 200) { console.log("PATCH", ID, p.status, JSON.stringify(p.j)?.slice(0, 200)); process.exit(4); }
}
const a = await api("GET", `/files/${ID}?fields=${FIELDS}`);
const ok = a.j?.data?.herkomst === want.herkomst && a.j?.data?.description === want.description;
console.log(ok ? "OK " : "BAD", JSON.stringify(a.j?.data));
console.log(`readback: ${ok ? 1 : 0} ok, ${ok ? 0 : 1} fout`);
process.exit(ok ? 0 : 6);
