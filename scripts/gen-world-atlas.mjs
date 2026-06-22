#!/usr/bin/env node
/**
 * gen-world-atlas.mjs — genereert src/data/atlas/world-countries.json (LAT-1659)
 *
 * Echte, herkenbare WERELD-geometrie voor de klikbare wijnkaart op /ontdek/.
 * Bron: world-atlas (Natural Earth admin-0, 50m) -> topojson -> d3 geoNaturalEarth1
 * -> Douglas-Peucker simplificatie in viewBox-ruimte.
 *
 * Marijn-feedback (LAT-1659): de kaart moet een WERELDkaart zijn, niet alleen
 * Europa — elk land met een gepubliceerde /landen/{slug}/ moet klikbaar zijn,
 * ook buiten Europa (Zuid-Afrika!). Niet-gepubliceerde landen worden als
 * gedempte/inerte context getekend. De kaart vult het hele paneel.
 *
 * Gebruik (eenmalige cartografie-inspanning; nieuw wijnland = entry in WINE):
 *   npm i -D d3-geo topojson-client
 *   node scripts/gen-world-atlas.mjs
 *
 * Wijnlanden krijgen hun NL land-slug als key (zo matchen ze de gepubliceerde
 * /landen/{slug}/ uit Directus en worden ze klikbaar). Alle overige landen
 * krijgen een `ctx:`-prefix key en blijven inerte context. De viewBox wordt
 * strak om de inhoud gefit; Antarctica wordt weggelaten zodat de kaart het
 * paneel vult i.p.v. veel lege poolruimte.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as d3 from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/atlas/world-countries.json');
const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';

// NL land-slug -> dataset-naam (Natural Earth) -> NL label.
// Deze landen worden gekeyd op hun NL-slug zodat ze matchen met een
// gepubliceerde /landen/{slug}/ en klikbaar worden. Ruim genomen: ook
// wijnlanden die we (nog) niet gepubliceerd hebben staan erin, zodat een
// toekomstige publish meteen klikbaar op de kaart verschijnt.
const WINE = [
  ['portugal', 'Portugal', 'Portugal'],
  ['spanje', 'Spain', 'Spanje'],
  ['frankrijk', 'France', 'Frankrijk'],
  ['italie', 'Italy', 'Italië'],
  ['duitsland', 'Germany', 'Duitsland'],
  ['oostenrijk', 'Austria', 'Oostenrijk'],
  ['zwitserland', 'Switzerland', 'Zwitserland'],
  ['belgie', 'Belgium', 'België'],
  ['nederland', 'Netherlands', 'Nederland'],
  ['verenigd-koninkrijk', 'United Kingdom', 'Verenigd Koninkrijk'],
  ['zuid-afrika', 'South Africa', 'Zuid-Afrika'],
  ['griekenland', 'Greece', 'Griekenland'],
  ['hongarije', 'Hungary', 'Hongarije'],
  ['kroatie', 'Croatia', 'Kroatië'],
  ['slovenie', 'Slovenia', 'Slovenië'],
  ['georgie', 'Georgia', 'Georgië'],
  ['argentinie', 'Argentina', 'Argentinië'],
  ['chili', 'Chile', 'Chili'],
  ['verenigde-staten', 'United States of America', 'Verenigde Staten'],
  ['australie', 'Australia', 'Australië'],
  ['nieuw-zeeland', 'New Zealand', 'Nieuw-Zeeland'],
];
const wineByName = new Map(WINE.map(([slug, en, nl]) => [en, { slug, nl }]));

// Landen die we niet tekenen (eten viewBox-ruimte op, geen wijncontext).
const DROP = new Set(['Antarctica']);

const FIT = 1000;       // doel-breedte van de projectie-extent
const TOL = 0.6;        // Douglas-Peucker tolerantie in px (wereldschaal)
const MIN_AREA_PX = 3;  // drop geprojecteerde ringen kleiner dan dit (specks)
const PAD = 8;
const WRAP_JUMP = FIT * 0.5; // x-sprong > halve wereld = antimeridiaan-wrap

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const topo = await (await fetch(SOURCE)).json();
const fc = topoFeature(topo, topo.objects.countries);
const drawnFeatures = fc.features.filter((f) => !DROP.has(f.properties.name));

const projection = d3.geoNaturalEarth1();
projection.fitExtent(
  [[0, 0], [FIT, FIT]],
  { type: 'FeatureCollection', features: drawnFeatures },
);

const project = (r) => r.map((p) => projection(p)).filter((xy) => xy && isFinite(xy[0]) && isFinite(xy[1]));

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function ringAreaPx(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}
function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    const cross = x0 * y1 - x1 * y0; a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-6) { let sx = 0, sy = 0; for (const [x, y] of r) { sx += x; sy += y; } return [sx / r.length, sy / r.length]; }
  return [cx / (6 * a), cy / (6 * a)];
}

// Splits een geprojecteerde ring op antimeridiaan-wraps: punt-voor-punt
// projecteren tekent anders een horizontale streep dwars over de kaart voor
// landen die ±180° kruisen (Rusland, VS/Aleoeten, Fiji). Een x-sprong groter
// dan een halve wereldbreedte = wrap -> daar de ring opbreken in losse stukken.
function splitOnWrap(pts) {
  const segs = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    if (cur.length && Math.abs(pts[i][0] - cur[cur.length - 1][0]) > WRAP_JUMP) {
      segs.push(cur); cur = [];
    }
    cur.push(pts[i]);
  }
  if (cur.length) segs.push(cur);
  // Sluit-segment (laatste->eerste) ook checken; alleen mergen als geen wrap.
  if (segs.length > 1 && Math.abs(segs[0][0][0] - segs[segs.length - 1][segs[segs.length - 1].length - 1][0]) <= WRAP_JUMP) {
    segs[0] = segs.pop().concat(segs[0]);
  }
  return segs;
}

function simplifiedRings(feat) {
  const g = feat.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const out = [];
  for (const poly of polys) {
    let pts = project(poly[0]);
    if (pts.length > 1) {
      const f = pts[0], l = pts[pts.length - 1];
      if (Math.abs(f[0] - l[0]) < 0.01 && Math.abs(f[1] - l[1]) < 0.01) pts.pop();
    }
    const simp = dp(pts, TOL);
    for (const seg of splitOnWrap(simp)) {
      if (seg.length >= 3 && Math.abs(ringAreaPx(seg)) >= MIN_AREA_PX) out.push(seg);
    }
  }
  return out;
}

// Bouw alle landen (wijn = NL-slug key + klikbaar; rest = ctx: key + inert).
const built = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const feat of drawnFeatures) {
  const rings = simplifiedRings(feat);
  if (!rings.length) continue;
  const wine = wineByName.get(feat.properties.name);
  const key = wine ? wine.slug : `ctx:${slugify(feat.properties.name)}`;
  const name = wine ? wine.nl : feat.properties.name;
  built.push({ key, name, rings, wine: Boolean(wine) });
  for (const r of rings) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}

const vbMinX = Math.floor(minX - PAD), vbMinY = Math.floor(minY - PAD);
const vbW = Math.ceil(maxX - minX + 2 * PAD), vbH = Math.ceil(maxY - minY + 2 * PAD);
const viewBox = `${vbMinX} ${vbMinY} ${vbW} ${vbH}`;
const r1 = (n) => Math.round(n * 10) / 10;

const out = {
  _meta: {
    description:
      'LAT-1659 — echte, herkenbare WERELD-geometrie voor de klikbare wijnkaart op /ontdek/. Bron: world-atlas (Natural Earth admin-0, 50m) via topojson, geprojecteerd met d3 geoNaturalEarth1 en vereenvoudigd met Douglas-Peucker (tol 0.6px) in de viewBox. Antarctica weggelaten; geprojecteerde ringen <3px2 gedropt. Wijnlanden zijn gekeyd op NL land-slug (matchen /landen/{slug}/ -> klikbaar); overige landen hebben een ctx:-prefix key en zijn inerte, gedempte context. Nieuw wijnland = entry in scripts/gen-world-atlas.mjs (WINE) en regenereren.',
    viewBox,
    source: 'world-atlas@2 countries-50m (Natural Earth admin-0)',
    projection: 'd3.geoNaturalEarth1',
  },
  countries: {},
};

for (const c of built) {
  const d = c.rings.map((r) => 'M' + r.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L') + ' Z').join(' ');
  const allPts = [];
  for (const r of c.rings) for (const p of r) allPts.push(p);
  const vAvg = allPts.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((v) => v / allPts.length);
  let largest = c.rings[0], maxA = -1;
  for (const r of c.rings) { const a = Math.abs(ringAreaPx(r)); if (a > maxA) { maxA = a; largest = r; } }
  const cen = ringCentroid(largest);
  out.countries[c.key] = {
    name: c.name,
    d,
    wine: c.wine,
    labelOffset: { x: r1(cen[0] - vAvg[0]), y: r1(cen[1] - vAvg[1]) },
  };
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const missing = WINE.map(([slug, en]) => en).filter((en) => !built.some((b) => b.wine && wineByName.get(en) && out.countries[wineByName.get(en).slug]));
const wineCount = built.filter((b) => b.wine).length;
console.log('geschreven:', OUT);
console.log('viewBox', viewBox, '| landen totaal', Object.keys(out.countries).length, '| wijnlanden', wineCount);
if (missing.length) console.warn('WAARSCHUWING: wijnland niet gevonden in bron:', missing.join(', '));
