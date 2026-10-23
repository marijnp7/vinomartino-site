#!/usr/bin/env node
// LAT-14556: routeslaapkaarten in de gebouwde HTML (HARDE REGEL 68).
// Rood als op een /wijnroutes/-pagina (NL of EN):
//  - een slaapkaart met gekoppeld accommodations-record (data-acc-record) geen <img> toont;
//  - een volle slaapkaart zonder media rendert (geen beeld en geen placeholder);
//  - hetzelfde adres meer dan één keer als volle kaart staat (herhaling = compacte verwijzing);
//  - een verwijzing in het kaartraster van het slaapoverzicht staat (rekt op tot een lege tegel).
// Draait als blokkerende stap na `npm run build` in .github/workflows/deploy.yml.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTICLE = /<article\b([^>]*)>([\s\S]*?)<\/article>/g;
const attr = (attrs, name) => {
  const m = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>/]|$)`).exec(attrs);
  return m ? (m[1] ?? '') : null;
};

export function scanHtml(html) {
  const findings = [];
  const vol = new Map();
  let kaarten = 0;
  for (const m of html.matchAll(ARTICLE)) {
    const [, attrs, inner] = m;
    const key = attr(attrs, 'data-route-stay');
    if (key == null) continue;
    kaarten++;
    if (attr(attrs, 'data-route-stay-ref') != null) continue;
    vol.set(key, (vol.get(key) ?? 0) + 1);
    const media = /class="poi-card__media[^"]*"/.test(inner);
    const img = /<img\b[^>]*class="[^"]*poi-card__img/.test(inner);
    // LAT-14556: een record mét foto moet die foto tonen; alleen een record dat expliciet
    // "zonder-foto" is (geen toegestane foto) mag de huisstijl-placeholder hebben.
    const rec = attr(attrs, 'data-acc-record');
    if (rec != null && rec !== 'zonder-foto' && !img) findings.push({ kind: 'record-zonder-beeld', key });
    else if (!media) findings.push({ kind: 'geen-media', key });
  }
  for (const g of html.matchAll(/class="rslaap__grid[^"]*"/g)) {
    const rest = html.slice(g.index);
    const eind = rest.search(/class="rslaap__(?:refs|disclosure)[^"]*"|<\/section>/);
    const raster = eind < 0 ? rest : rest.slice(0, eind);
    for (const r of raster.matchAll(/data-route-stay="([^"]*)"[^>]*data-route-stay-ref/g)) findings.push({ kind: 'verwijzing-in-raster', key: r[1] });
  }
  for (const [key, n] of vol) if (n > 1) findings.push({ kind: 'dubbele-kaart', key, n });
  return { kaarten, findings };
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  if (!existsSync(dist)) { console.error(`check-route-stay-images: ${dist} bestaat niet`); process.exit(1); }
  let paginas = 0, kaarten = 0, fout = 0;
  for (const f of htmlFiles(dist)) {
    const rel = relative(dist, f).split(sep).join('/');
    if (!/^(en\/)?wijnroutes\/[^/]+\/index\.html$/.test(rel)) continue;
    const r = scanHtml(readFileSync(f, 'utf8'));
    if (r.kaarten === 0) continue;
    paginas++; kaarten += r.kaarten;
    for (const x of r.findings) { fout++; console.error(`::error::LAT-14556 ${rel}: ${x.kind} (${x.key}${x.n ? `, ${x.n}x` : ''})`); }
  }
  if (paginas === 0) { console.error('check-route-stay-images: geen routepagina met slaapkaarten gevonden (lege of verkeerde dist?)'); process.exit(1); }
  console.log(`check-route-stay-images: ${paginas} routepagina's, ${kaarten} slaapkaarten, ${fout} fouten`);
  process.exit(fout ? 1 : 0);
}
