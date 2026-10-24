// LAT-14740: EN-adres (alleen taal) voor 4 gepubliceerde Etna-huizen + 8 drafts (Toscane/Frankrijk). --apply om te schrijven.
const U = process.env.DIRECTUS_URL || "http://directus:8055";
const H = { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const apply = process.argv.includes("--apply");
const NL = /Kaapstad|Zuid-Afrika|Frankrijk|Italië|Spanje|Duitsland|Oostenrijk|Slowakije|Hongarije|Zwitserland|Griekenland|Georgië|Toscane|Piëmont|Bourgogne|Sicilië|Sardinië|Catalonië|Moezel|Zuid-Tirol|Wenen|Lissabon/;
const ws = (await (await fetch(`${U}/items/wijnhuizen?limit=-1&fields=id,slug,status,address,translations.id,translations.languages_code,translations.address`, { headers: H })).json()).data;
let n = 0;
for (const w of ws) {
  const t = (w.translations || []).find(x => x.languages_code === "en");
  if (!w.address || !NL.test(w.address) || (t && t.address)) continue;
  n++;
  const a = w.address.replace(/, Sicilië$/, ", Sicily").replace(/, Toscane$/, ", Tuscany").replace(/, Frankrijk$/, ", France");
  if (!t || NL.test(a)) { console.log("NOMAP", w.slug, w.status, JSON.stringify(w.address), t ? "t" + t.id : "geen-en-rij"); continue; }
  console.log("ADDR", w.slug, w.status, "t" + t.id, JSON.stringify(a));
  if (apply) { const r = await fetch(`${U}/items/wijnhuizen_translations/${t.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ address: a }) }); console.log("  PATCH", r.status); }
}
console.log("OPEN", n);
