#!/usr/bin/env node
/**
 * gen-europe-atlas.mjs — genereert src/data/atlas/europe-countries.json (LAT-1659)
 *
 * Echte, herkenbare landgeometrie voor de klikbare Europa-wijnkaart op /ontdek/.
 * Bron: world-atlas (Natural Earth admin-0, 50m) -> topojson -> d3 geoConicConformal
 * -> Douglas-Peucker simplificatie in viewBox-ruimte.
 *
 * Gebruik (eenmalige cartografie-inspanning; nieuw wijnland = entry erbij in MAP):
 *   npm i -D d3-geo topojson-client
 *   node scripts/gen-europe-atlas.mjs
 *
 * De viewBox wordt strak om de inhoud gefit (kaart vult het paneel). labelOffset
 * per land corrigeert de vertex-gemiddelde anker van <DiscoverMapEurope> naar het
 * oppervlakte-zwaartepunt van de grootste ring, zodat labels netjes binnen het land vallen.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as d3 from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/atlas/europe-countries.json');
const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';

// Dutch slug -> dataset-naam (Natural Earth) -> NL label
const MAP = [
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
];

const LON = [-12, 32];
const LAT = [34, 61];
const ISLAND_MIN = 0.06; // graden^2 — drop kleine eilandjes, houd Sicilië/Sardinië/GB
const FIT = 1000;
const TOL = 1.1; // Douglas-Peucker tolerantie in px
const PAD = 12;

const inWindow = ([lon, lat]) => lon >= LON[0] && lon <= LON[1] && lat >= LAT[0] && lat <= LAT[1];
function ringInWindow(r) {
  let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; }
  return inWindow([x / r.length, y / r.length]);
}
function geoArea(r) {
  let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a) / 2;
}

const topo = await (await fetch(SOURCE)).json();
const fc = topoFeature(topo, topo.objects.countries);
const featByName = (n) => {
  const f = fc.features.find((x) => x.properties.name === n);
  if (!f) throw new Error('ontbrekend land in bron: ' + n);
  return f;
};

function exteriorRings(feat) {
  const g = feat.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const out = [];
  for (const poly of polys) {
    const ext = poly[0];
    if (ringInWindow(ext) && geoArea(ext) >= ISLAND_MIN) out.push(ext);
  }
  return out;
}

const countries = MAP.map(([slug, en, nl]) => ({ slug, nl, rings: exteriorRings(featByName(en)) }));

const projection = d3.geoConicConformal().parallels([43, 62]).rotate([-10, 0]);
projection.fitExtent([[0, 0], [FIT, FIT]], {
  type: 'FeatureCollection',
  features: countries.map((c) => ({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: c.rings.map((r) => [r]) } })),
});

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

function ringToSimplified(ring) {
  let pts = project(ring);
  // GeoJSON-ringen zijn gesloten (eerste==laatste); drop dup zodat DP een echte baseline heeft
  if (pts.length > 1) {
    const f = pts[0], l = pts[pts.length - 1];
    if (Math.abs(f[0] - l[0]) < 0.01 && Math.abs(f[1] - l[1]) < 0.01) pts.pop();
  }
  return dp(pts, TOL);
}

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const c of countries) {
  c.simp = c.rings.map(ringToSimplified).filter((r) => r.length >= 3);
  if (!c.simp.length) throw new Error('geen geometrie voor ' + c.slug);
  for (const r of c.simp) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}

const vbMinX = Math.floor(minX - PAD), vbMinY = Math.floor(minY - PAD);
const vbW = Math.ceil(maxX - minX + 2 * PAD), vbH = Math.ceil(maxY - minY + 2 * PAD);
const viewBox = `${vbMinX} ${vbMinY} ${vbW} ${vbH}`;
const r1 = (n) => Math.round(n * 10) / 10;

const ringAreaPx = (r) => {
  let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
};
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

const out = {
  _meta: {
    description:
      'LAT-1659 — echte, herkenbare landgeometrie voor de klikbare Europa-wijnkaart op /ontdek/. Bron: world-atlas (Natural Earth admin-0, 50m) via topojson, geprojecteerd met d3 geoConicConformal (parallels 43/62, rotate -10) en vereenvoudigd met Douglas-Peucker (tol 1.1px) in de viewBox. Overzeese gebieden/verre eilanden uitgefilterd (lon -12..32, lat 34..61); alleen exterieure ringen, eilanden >0.06deg2. Gekeyd op land-slug; landen met een gepubliceerde /landen/{slug}/ worden klikbaar, de rest is gedempte context. Nieuw wijnland = entry erbij in scripts/gen-europe-atlas.mjs en regenereren.',
    viewBox,
    source: 'world-atlas@2 countries-50m (Natural Earth admin-0)',
    projection: 'd3.geoConicConformal parallels=[43,62] rotate=[-10,0]',
  },
  countries: {},
};

for (const c of countries) {
  const d = c.simp.map((r) => 'M' + r.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L') + ' Z').join(' ');
  const allPts = [];
  for (const r of c.simp) for (const p of r) allPts.push(p);
  const vAvg = allPts.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((v) => v / allPts.length);
  let largest = c.simp[0], maxA = -1;
  for (const r of c.simp) { const a = Math.abs(ringAreaPx(r)); if (a > maxA) { maxA = a; largest = r; } }
  const cen = ringCentroid(largest);
  out.countries[c.slug] = { name: c.nl, d, labelOffset: { x: r1(cen[0] - vAvg[0]), y: r1(cen[1] - vAvg[1]) } };
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('geschreven:', OUT, '| viewBox', viewBox, '| landen', Object.keys(out.countries).length);
