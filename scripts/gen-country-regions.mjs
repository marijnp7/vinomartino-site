#!/usr/bin/env node
/**
 * gen-country-regions.mjs — genereert src/data/atlas/regions/{land-slug}.json (LAT-1662)
 *
 * Echte, herkenbare wijngebied-geometrie voor de landpagina's. Eén niveau dieper
 * dan de /ontdek/ kaart (LAT-1659): per land worden de wijnstreken in ECHTE
 * geografische geometrie getekend i.p.v. de oude hand-getekende blobs.
 *
 * Bron: Natural Earth admin-1 (10m, provincies) -> gegroepeerd op `region`
 * -> per region gedissolved tot één silhouet via topojson (interne
 * provinciegrenzen weg) -> d3-projectie -> Douglas-Peucker simplificatie.
 *
 * Wijnstreken (een region met een gepubliceerde /streken/{slug}/) krijgen hun
 * streek-slug als key en worden ingekleurd/klikbaar; overige regions zijn
 * gedempte, inerte context.
 *
 * Gebruik (eenmalige cartografie; nieuwe streek = entry in COUNTRIES.regionMap):
 *   npm i --no-save d3-geo topojson-client topojson-server
 *   node scripts/gen-country-regions.mjs            # alle landen
 *   node scripts/gen-country-regions.mjs italie     # één land
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as d3 from 'd3-geo';
import { topology } from 'topojson-server';
import { merge } from 'topojson-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/data/atlas/regions');
const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';

// Per land: NE `admin`-naam, projectie, en de mapping van NE `region` -> streek.
// `wine`-regions krijgen hun streek-slug als key (matcht /streken/{slug}/ -> klikbaar).
// Niet-genoemde regions worden inerte context (key `ctx:<slug>`).
const COUNTRIES = {
  italie: {
    admin: 'Italy',
    label: 'Italië',
    // d3.geoConicConformal centraal op de laars.
    projection: () => d3.geoConicConformal().parallels([38, 44]).rotate([-12, 0]),
    // slug = de LIVE /streken/{slug}/-slug (Directus), NIET de seed-slug. Anders
    // matcht meta[key] niet en rendert de kaart leeg (LAT-1662 regressie 06-22).
    // langhe-piemonte/toscane-italie/veneto-italie/campania-italie/puglia-italie/
    // sardegna-italie zijn geverifieerd 200 op prod. lazio/sicilie zijn nog niet
    // gepubliceerd (404) → blijven grijze context tot publicatie; -italie-gok.
    regionMap: {
      Piemonte: { slug: 'langhe-piemonte', nl: 'Piemonte' },
      Veneto: { slug: 'veneto-italie', nl: 'Veneto' },
      Toscana: { slug: 'toscane-italie', nl: 'Toscane' },
      Lazio: { slug: 'lazio-italie', nl: 'Lazio' },
      Campania: { slug: 'campania-italie', nl: 'Campania' },
      Apulia: { slug: 'puglia-italie', nl: 'Puglia' },
      // Het wijngebied heet "Sicilië" (Marijn 06-22: "het wijngebied van etna
      // heet sicilie"). Het hele eiland-silhouet is de klikbare wijnstreek,
      // gelabeld "Sicilië", linkend naar de Directus-streek /streken/etna-sicilie/.
      Sicily: { slug: 'etna-sicilie', nl: 'Sicilië' },
      Sardegna: { slug: 'sardegna-italie', nl: 'Sardinië' },
      // Sinds 06-22 ook gepubliceerd (live 200) → klikbaar i.p.v. context.
      'Emilia-Romagna': { slug: 'emilia-romagna-italie', nl: 'Emilia-Romagna' },
      'Friuli-Venezia Giulia': { slug: 'friuli-italie', nl: 'Friuli' },
      'Trentino-Alto Adige': { slug: 'trentino-italie', nl: 'Trentino' },
    },
    // NL-labels voor context-regions (anders valt NE-naam terug).
    ctxLabels: {
      Lombardia: 'Lombardije',
      Marche: 'Marche',
      Calabria: 'Calabrië',
      Liguria: 'Ligurië',
      Abruzzo: 'Abruzzo',
      Molise: 'Molise',
      Basilicata: 'Basilicata',
      Umbria: 'Umbrië',
      "Valle d'Aosta": "Valle d'Aosta",
    },
  },

  frankrijk: {
    admin: 'France',
    label: 'Frankrijk',
    projection: () => d3.geoConicConformal().parallels([44, 49]).rotate([-2.5, 0]),
    // NE groepeert départements op de moderne `region`. De wijnstreken vallen in
    // de samengevoegde régions: Bourgogne in Bourgogne-Franche-Comté, Champagne
    // in Grand Est. Grovere granulariteit (zoals Sicilië = heel het eiland).
    regionMap: {
      'Bourgogne-Franche-Comté': { slug: 'bourgogne', nl: 'Bourgogne' },
      'Grand Est': { slug: 'champagne', nl: 'Champagne' },
    },
    ctxLabels: {
      'Nouvelle-Aquitaine': 'Bordeaux / Zuidwest',
      Occitanie: 'Languedoc',
      "Provence-Alpes-Côte-d'Azur": 'Provence',
      'Centre-Val de Loire': 'Loire',
      'Auvergne-Rhône-Alpes': 'Rhône',
      Corse: 'Corsica',
      'Pays de la Loire': 'Pays de la Loire',
      Bretagne: 'Bretagne',
      Normandie: 'Normandië',
      'Hauts-de-France': 'Hauts-de-France',
      'Île-de-France': 'Île-de-France',
    },
    // Overzeese départements (DOM) zouden de projectie wereldwijd uitzoomen.
    exclude: new Set(['Guadeloupe', 'Guyane française', 'Martinique', 'Mayotte', 'Réunion']),
  },

  spanje: {
    admin: 'Spain',
    label: 'Spanje',
    projection: () => d3.geoConicConformal().parallels([37, 43]).rotate([3.5, 0]),
    regionMap: {
      Andalucía: { slug: 'jerez', nl: 'Jerez · Andalusië' },
      Cataluña: { slug: 'priorat-catalonie', nl: 'Catalonië · Priorat' },
    },
    ctxLabels: {
      'La Rioja': 'Rioja',
      'Castilla y León': 'Castilië-León',
      Galicia: 'Galicië',
      'País Vasco': 'Baskenland',
      Aragón: 'Aragón',
      'Castilla-La Mancha': 'Castilië-La Mancha',
      Valenciana: 'Valencia',
      Extremadura: 'Extremadura',
      Murcia: 'Murcia',
      Madrid: 'Madrid',
      'Foral de Navarra': 'Navarra',
      Asturias: 'Asturië',
      Cantabria: 'Cantabrië',
    },
    exclude: new Set(['Canary Is.', 'Ceuta', 'Melilla', 'Islas Baleares']),
  },

  portugal: {
    admin: 'Portugal',
    label: 'Portugal',
    projection: () => d3.geoConicConformal().parallels([38, 42]).rotate([8, 0]),
    regionMap: {
      Norte: { slug: 'douro-portugal', nl: 'Douro · Norte' },
    },
    ctxLabels: {
      Centro: 'Centro',
      Lisbon: 'Lissabon',
      Alentejo: 'Alentejo',
      Algarve: 'Algarve',
      'Norte, Centro': 'Centro',
    },
    exclude: new Set(['Madeira', 'Azores']),
  },

  oostenrijk: {
    admin: 'Austria',
    label: 'Oostenrijk',
    // NE heeft geen `region` voor Oostenrijk → groepering valt terug op `name`
    // (de Bundesländer). Wachau ligt in Niederösterreich.
    projection: () => d3.geoConicConformal().parallels([46, 49]).rotate([-14, 0]),
    regionMap: {
      Burgenland: { slug: 'burgenland', nl: 'Burgenland' },
      Niederösterreich: { slug: 'wachau', nl: 'Wachau · Neder-Oostenrijk' },
    },
    ctxLabels: {
      Steiermark: 'Stiermarken',
      Wien: 'Wenen',
      Oberösterreich: 'Opper-Oostenrijk',
      Kärnten: 'Karinthië',
      Tirol: 'Tirol',
      Salzburg: 'Salzburg',
      Vorarlberg: 'Vorarlberg',
    },
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
    const geom = dissolveRegion(feats);
    const wine = cfg.regionMap[reg];
    dissolved.push({
      region: reg,
      geom,
      key: wine ? wine.slug : `ctx:${slugify(reg)}`,
      name: wine ? wine.nl : (cfg.ctxLabels?.[reg] || reg),
      wine: Boolean(wine),
    });
  }

  const projection = cfg.projection();
  projection.fitExtent([[PAD, PAD], [FIT - PAD, FIT - PAD]], {
    type: 'FeatureCollection',
    features: dissolved.map((d) => ({ type: 'Feature', geometry: d.geom })),
  });
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

  const vbMinX = Math.floor(minX - PAD), vbMinY = Math.floor(minY - PAD);
  const vbW = Math.ceil(maxX - minX + 2 * PAD), vbH = Math.ceil(maxY - minY + 2 * PAD);
  const viewBox = `${vbMinX} ${vbMinY} ${vbW} ${vbH}`;

  const out = {
    _meta: {
      description:
        `LAT-1662 — echte wijngebied-geometrie voor /landen/${slug}/. Bron: Natural Earth admin-1 (10m) gegroepeerd op region en gedissolved via topojson; geprojecteerd met d3 en vereenvoudigd (Douglas-Peucker). Wijnstreken zijn gekeyd op streek-slug (matcht /streken/{slug}/ -> klikbaar); overige regions zijn inerte context. Nieuwe streek = entry in scripts/gen-country-regions.mjs (regionMap) en regenereren.`,
      viewBox,
      source: 'natural-earth-vector ne_10m_admin_1_states_provinces',
      projection: cfg.projection().toString?.() || 'd3 projection',
      country: cfg.label,
    },
    regions: {},
  };

  for (const c of built) {
    const d = c.rings.map((r) => 'M' + r.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L') + ' Z').join(' ');
    let largest = c.rings[0], maxA = -1;
    for (const r of c.rings) { const a = Math.abs(ringAreaPx(r)); if (a > maxA) { maxA = a; largest = r; } }
    const cen = ringCentroid(largest);
    out.regions[c.key] = {
      name: c.name,
      d,
      wine: c.wine,
      labelAt: { x: r1(cen[0]), y: r1(cen[1]) },
    };
  }

  // Puntmarkers: streken die geen eigen admin-1 silhouet krijgen (bv. Etna =
  // klein gebied binnen Sicilië). Geprojecteerd met dezelfde gefitte projectie.
  const markers = [];
  for (const mk of cfg.markers || []) {
    const xy = projection([mk.lon, mk.lat]);
    if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) {
      console.warn(`[markers] projectie faalde voor ${mk.slug} (${slug})`);
      continue;
    }
    markers.push({ slug: mk.slug, name: mk.nl, x: r1(xy[0]), y: r1(xy[1]), badge: mk.badge ?? null });
  }
  if (markers.length) out.markers = markers;

  return { out, wineCount: built.filter((b) => b.wine).length, total: built.length, markerCount: markers.length, viewBox };
}

const only = process.argv[2];
const targets = only ? [only] : Object.keys(COUNTRIES);
const all = await loadSource();
mkdirSync(OUT_DIR, { recursive: true });
for (const slug of targets) {
  const cfg = COUNTRIES[slug];
  if (!cfg) { console.warn('onbekend land:', slug); continue; }
  const { out, wineCount, total, markerCount, viewBox } = buildCountry(slug, cfg, all);
  const file = resolve(OUT_DIR, `${slug}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`geschreven: ${file} | regions ${total} | wijnstreken ${wineCount} | markers ${markerCount} | viewBox ${viewBox}`);
}
