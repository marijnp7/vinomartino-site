#!/usr/bin/env node
/**
 * Generate national atlas SVG geometry. Natural Earth is background ONLY.
 * Wine overlays come from the checked-in WGS84 wine-areas/*.geojson, built
 * from Candiago et al. (2022), CC0, at municipality resolution.
 * Rebuild source areas: scripts/cartography/build-wine-areas.py
 * Run: NE_LOCAL=/path/ne-admin1.geojson node scripts/gen-country-regions.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as d3 from 'd3-geo';
import { topology } from 'topojson-server';
import { merge } from 'topojson-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/data/atlas/regions');
const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';

// Geographic projection and background framing, not wine-area definitions.
const COUNTRIES = {
  frankrijk: { admin: 'France', label: 'Frankrijk', projection: () => d3.geoConicConformal().parallels([44,49]).rotate([-2.5,0]), exclude: new Set(['Guadeloupe','Guyane française','Martinique','Mayotte','Réunion']) },
  italie: { admin: 'Italy', label: 'Italië', projection: () => d3.geoConicConformal().parallels([38,44]).rotate([-12,0]) },
  spanje: { admin: 'Spain', label: 'Spanje', projection: () => d3.geoConicConformal().parallels([37,43]).rotate([3.5,0]), exclude: new Set(['Canary Is.','Ceuta','Melilla','Islas Baleares']) },
  portugal: { admin: 'Portugal', label: 'Portugal', projection: () => d3.geoConicConformal().parallels([38,42]).rotate([8,0]), exclude: new Set(['Madeira','Azores']) },
  duitsland: { admin: 'Germany', label: 'Duitsland', projection: () => d3.geoConicConformal().parallels([48,54]).rotate([-10,0]) },
  oostenrijk: { admin: 'Austria', label: 'Oostenrijk', projection: () => d3.geoConicConformal().parallels([46,49]).rotate([-14,0]) },
  slowakije: { admin: 'Slovakia', label: 'Slowakije', projection: () => d3.geoConicConformal().parallels([48,49.5]).rotate([-19.5,0]) },
  'zuid-afrika': {
    admin: 'South Africa', label: 'Zuid-Afrika',
    projection: () => d3.geoConicConformal().parallels([-32,-35]).rotate([-19,0]),
    fitBounds: [[17.6,-34.6],[19.65,-32.15]],
    exclude: new Set(['KwaZulu-Natal','Free State','Limpopo','North West','Mpumalanga','Gauteng','Northern Cape','Eastern Cape']),

  },
};

const FIT = 1000; // doel-breedte projectie-extent
const TOL = 0.45; // Douglas-Peucker tolerantie (px) op landschaal
const MIN_AREA_PX = 2;
const PAD = 10;

const r1 = (n) => Math.round(n * 10) / 10;
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
      const dd = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
      if (dd > maxD) { maxD = dd; idx = i; }
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

async function loadSource() {
  // NE_LOCAL = pad naar een lokaal gecachete ne_10m_admin_1_states_provinces.geojson
  // (vermijdt de ~40MB fetch bij herhaald genereren / offline build).
  if (process.env.NE_LOCAL) return JSON.parse(readFileSync(process.env.NE_LOCAL, 'utf8'));
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`bron-fetch faalde: HTTP ${res.status}`);
  return res.json();
}

// Dissolve alle provincies van een region tot één GeoJSON-geometrie.
function dissolveRegion(features) {
  const topo = topology({ r: { type: 'GeometryCollection', geometries: features.map((f) => f.geometry) } });
  return merge(topo, topo.objects.r.geometries);
}

function buildCountry(slug, cfg, all) {
  const provinces = all.features.filter((f) => f.properties.admin === cfg.admin);
  if (!provinces.length) throw new Error(`geen provincies voor admin="${cfg.admin}"`);

  // Groepeer op NE `region` (valt terug op `name` als region ontbreekt, bv. AT).
  // `exclude` dropt overzeese gebieden die de projectie zouden uitzoomen.
  const byRegion = new Map();
  for (const f of provinces) {
    const reg = f.properties.region || f.properties.name;
    if (cfg.exclude?.has(reg)) continue;
    if (!byRegion.has(reg)) byRegion.set(reg, []);
    byRegion.get(reg).push(f);
  }

  // Dissolve elke region en bouw één FeatureCollection voor de gedeelde projectie.
  const dissolved = [];
  for (const [reg, feats] of byRegion) {
    dissolved.push({ region: reg, geom: dissolveRegion(feats),
      key: `ctx:${slugify(reg)}`, name: reg, wine: false });
  }
  // Fit the projection to the country alone; overlay changes must never move it.
  const contextFeatures = dissolved.map(d => ({ type: 'Feature', geometry: d.geom }));
  {
    const source = JSON.parse(readFileSync(resolve(__dirname, `../src/data/atlas/wine-areas/${slug}.geojson`), 'utf8'));
    for (const feature of source.features) {
      const p = feature.properties;
      if (!p.source || !p.sourceIds?.length || !['municipality','wine-origin'].includes(p.resolution)) throw new Error(`Missing provenance: ${p.slug}`);
      dissolved.push({ region:p.slug, key:p.slug, name:p.name, wine:true,
        geom:feature.geometry, labelLonLat:p.labelLonLat, source:p.source,
        sourceIds:p.sourceIds, resolution:p.resolution });
    }
  }

  const projection = cfg.projection();
  if (cfg.fitBounds) {
    // Zoom op een vaste geografische bbox i.p.v. de volledige geometrie. Het
    // silhouet dat buiten de box valt wordt door de SVG-viewBox geclipt. Nodig
    // voor dichtopeen geclusterde streken (bv. de Kaapse wijnlanden) zodat de
    // de wijngebieden op een leesbare schaal worden getoond.
    const [[w, s], [e, n]] = cfg.fitBounds;
    projection.fitExtent([[PAD, PAD], [FIT - PAD, FIT - PAD]], {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[w, s], [w, n], [e, n], [e, s], [w, s]]] },
    });
  } else {
    projection.fitExtent([[PAD, PAD], [FIT - PAD, FIT - PAD]], {
      type: 'FeatureCollection',
      features: contextFeatures,
    });
  }
  const project = (r) => r.map((p) => projection(p)).filter((xy) => xy && isFinite(xy[0]) && isFinite(xy[1]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const built = [];
  for (const d of dissolved) {
    const g = d.geom;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const rings = [];
    for (const poly of polys) {
      for (const ringCoords of poly) {
        let pts = project(ringCoords);
        if (pts.length > 1) {
          const f = pts[0], l = pts[pts.length - 1];
          if (Math.abs(f[0] - l[0]) < 0.01 && Math.abs(f[1] - l[1]) < 0.01) pts.pop();
        }
        const simp = dp(pts, TOL);
        if (simp.length >= 3 && Math.abs(ringAreaPx(simp)) >= MIN_AREA_PX) rings.push(simp);
      }
    }
    if (!rings.length) continue;
    for (const r of rings) for (const [x, y] of r) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    built.push({ ...d, rings });
  }

  let viewBox;
  if (cfg.fitBounds) {
    // viewBox = de geprojecteerde bbox-hoeken (geometrie buiten de box clipt).
    const [[w, s], [e, n]] = cfg.fitBounds;
    const corners = [[w, s], [w, n], [e, n], [e, s]].map((c) => projection(c));
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    const bx = Math.floor(Math.min(...xs)), by = Math.floor(Math.min(...ys));
    const bw = Math.ceil(Math.max(...xs) - Math.min(...xs));
    const bh = Math.ceil(Math.max(...ys) - Math.min(...ys));
    viewBox = `${bx} ${by} ${bw} ${bh}`;
  } else {
    const vbMinX = Math.floor(minX - PAD), vbMinY = Math.floor(minY - PAD);
    const vbW = Math.ceil(maxX - minX + 2 * PAD), vbH = Math.ceil(maxY - minY + 2 * PAD);
    viewBox = `${vbMinX} ${vbMinY} ${vbW} ${vbH}`;
  }

  const out = {
    _meta: {
      description: 'Wine areas: Candiago et al. 2022, municipality-level PDO unions, simplified for national scale. Natural Earth administrative regions are background only. South Africa: Wine of Origin districts/wards from the public SAWIS web map.',
      geometryVersion: 'wine-pdo-2026-10-10',
      wineSource: slug === 'zuid-afrika' ? 'https://www.sawis.co.za/cert/productionareas.php' : 'https://doi.org/10.6084/m9.figshare.19312094',
      wineResolution: slug === 'zuid-afrika' ? 'wine-origin' : 'municipality',
      viewBox,
      source: 'natural-earth-vector ne_10m_admin_1_states_provinces',
      projection: { type: 'geoConicConformal', scale: projection.scale(), translate: projection.translate(), rotate: projection.rotate(), parallels: projection.parallels() },
      country: cfg.label,
    },
    regions: {},
  };

  for (const c of built) {
    const d = c.rings.map((r) => 'M' + r.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L') + ' Z').join(' ');
    let largest = c.rings[0], maxA = -1;
    for (const r of c.rings) { const a = Math.abs(ringAreaPx(r)); if (a > maxA) { maxA = a; largest = r; } }
    const cen = c.labelLonLat ? projection(c.labelLonLat) : ringCentroid(largest);
    out.regions[c.key] = {
      name: c.name,
      d,
      wine: c.wine,
      ...(c.wine ? { source: c.source, sourceIds: c.sourceIds, resolution: c.resolution } : {}),
      labelAt: { x: r1(cen[0]), y: r1(cen[1]) },
    };
  }

  return { out, wineCount: built.filter((b) => b.wine).length, total: built.length, viewBox };
}

const only = process.argv[2];
const targets = only ? [only] : Object.keys(COUNTRIES);
const all = await loadSource();
mkdirSync(OUT_DIR, { recursive: true });
for (const slug of targets) {
  const cfg = COUNTRIES[slug];
  if (!cfg) { console.warn('onbekend land:', slug); continue; }
  const { out, wineCount, total, viewBox } = buildCountry(slug, cfg, all);
  const file = resolve(OUT_DIR, `${slug}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`geschreven: ${file} | regions ${total} | wijnstreken ${wineCount} | viewBox ${viewBox}`);
}
