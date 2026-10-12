#!/usr/bin/env node
/**
 * LAT-13075 — korte kaarttitel voor de routehub (goedgekeurd home/routes-ontwerp).
 *
 * Voegt toe (nullable, backwards compatible; leeg = hub valt terug op de streeknaam):
 *   - routes.short_title               string(60)  NL-kaarttitel
 *   - routes_translations.short_title  string(60)  vertaling (EN)
 *
 * De loader (src/lib/routes.ts) leest beide velden al fail-soft. Geen waarden: die vult de
 * Lead Editor in het CMS. Idempotent: bestaand veld = overslaan. Rapporteert na afloop
 * hoeveel routes/vertalingen een waarde hebben (alleen tellingen).
 * Run: GHA lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL || "http://localhost:8055", T = process.env.DIRECTUS_TOKEN;
if (!T) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };

const field = (note) => ({
  field: "short_title",
  type: "string",
  meta: { interface: "input", width: "half", note, options: { trim: true, placeholder: "bv. Langhe" } },
  schema: { max_length: 60, is_nullable: true },
});

for (const [coll, note] of [
  ["routes", "Korte kaarttitel op /wijnroutes/ (max ~30 tekens). Leeg = streeknaam. (LAT-13075)"],
  ["routes_translations", "Korte kaarttitel op /en/wijnroutes/ in deze taal. Leeg = streeknaam. (LAT-13075)"],
]) {
  const ex = await fetch(`${U}/fields/${coll}/short_title`, { headers: H });
  if (ex.ok) { console.log(`[lat13075] ${coll}.short_title bestaat al, overslaan`); }
  else {
    const r = await fetch(`${U}/fields/${coll}`, { method: "POST", headers: H, body: JSON.stringify(field(note)) });
    const t = await r.text();
    if (!r.ok) { console.error(`[lat13075] ${coll}.short_title FAIL HTTP ${r.status}: ${t.slice(0, 200)}`); process.exit(1); }
    console.log(`[lat13075] ${coll}.short_title aangemaakt (HTTP ${r.status})`);
  }
  const q = coll === "routes" ? "id,short_title" : "id,languages_code,short_title";
  const r = await fetch(`${U}/items/${coll}?limit=-1&fields=${q}`, { headers: H });
  const rows = (await r.json()).data || [];
  console.log(`[lat13075] ${coll}: ${rows.filter((x) => x.short_title).length}/${rows.length} met short_title`);
}
