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
      // Langhe = deelgebied van Piemonte (Cuneo + Asti), niet heel Piemonte
      // (Marijn 06-28: "het moet de regio zijn, niet de provincie"). Piemonte
      // zelf blijft als gedempte context-onderlaag zichtbaar.
      Piemonte: { slug: 'langhe-piemonte', nl: 'Langhe', provinces: ['Cuneo', 'Asti'], parentNl: 'Piemonte' },
      Veneto: { slug: 'veneto-italie', nl: 'Veneto' },
      Toscana: { slug: 'toscane-italie', nl: 'Toscane' },
      Lazio: { slug: 'lazio-italie', nl: 'Lazio' },
      Campania: { slug: 'campania-italie', nl: 'Campania' },
      Apulia: { slug: 'puglia-italie', nl: 'Puglia' },
      // Etna = wijngebied rond de vulkaan (provincie Catania), niet heel Sicilië.
      // Sicilië blijft als gedempte context-onderlaag (Marijn 06-28).
      Sicily: { slug: 'etna-sicilie', nl: 'Etna', provinces: ['Catania'], parentNl: 'Sicilië' },
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
      // Bourgogne-wijngebied = Côte-d'Or + Saône-et-Loire + Yonne (de échte
      // Bourgogne-départements), niet de hele bestuurlijke régio
      // Bourgogne-Franche-Comté (die ook de Jura/Franche-Comté omvat).
      'Bourgogne-Franche-Comté': {
        slug: 'bourgogne', nl: 'Bourgogne',
        provinces: ["Côte-d'Or", 'Saône-et-Loire', 'Yonne'],
        parentNl: 'Bourgogne-Franche-Comté',
      },
      // Champagne = Marne + Aube (het wijngebied), niet de hele régio Grand Est
      // (die ook de Elzas/Lotharingen omvat).
      'Grand Est': {
        slug: 'champagne', nl: 'Champagne',
        provinces: ['Marne', 'Aube'],
        parentNl: 'Grand Est',
      },
      // Rhône = noordelijke Rhône-vallei (Rhône + Ardèche + Drôme: Côte-Rôtie,
      // Condrieu, Cornas, Hermitage/Crozes), niet de hele régio Auvergne-Rhône-
      // Alpes (die ook Lyon, de Alpen en Auvergne omvat). Zuidelijke Rhône
      // (Vaucluse) valt in NE-region Provence-Alpes-Côte-d'Azur en is met deze
      // per-region dissolve niet mee te nemen.
      'Auvergne-Rhône-Alpes': {
        slug: 'rhone', nl: 'Rhône',
        provinces: ['Rhône', 'Ardèche', 'Drôme'],
        parentNl: 'Auvergne-Rhône-Alpes',
      },
    },
    ctxLabels: {
      'Nouvelle-Aquitaine': 'Bordeaux / Zuidwest',
      Occitanie: 'Languedoc',
      "Provence-Alpes-Côte-d'Azur": 'Provence',
      'Centre-Val de Loire': 'Loire',
      'Auvergne-Rhône-Alpes': 'Auvergne-Rhône-Alpes',
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
      // Jerez = sherry-driehoek in provincie Cádiz, niet heel Andalusië.
      Andalucía: { slug: 'jerez', nl: 'Jerez', provinces: ['Cádiz'], parentNl: 'Andalusië' },
      // Priorat = DOQ in provincie Tarragona, niet heel Catalonië.
      Cataluña: { slug: 'priorat-catalonie', nl: 'Priorat', provinces: ['Tarragona'], parentNl: 'Catalonië' },
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
      // Douro-vallei = districten Vila Real + Bragança (oostelijk Norte), niet
      // heel Norte (dat ook Porto en de kust omvat).
      Norte: { slug: 'douro-portugal', nl: 'Douro', provinces: ['Vila Real', 'Bragança'], parentNl: 'Norte' },
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
    // Burgenland = eigen Bundesland én wijngebied → blijft heel-silhouet.
    // Wachau is een kleine Donau-strook binnen Niederösterreich; NE heeft geen
    // sub-provincies voor Oostenrijk, dus geen deel-silhouet mogelijk → puntmarker
    // (zoals Mosel/Pfalz). Niederösterreich zelf = gedempte context.
    regionMap: {
      Burgenland: { slug: 'burgenland', nl: 'Burgenland' },
    },
    ctxLabels: {
      Niederösterreich: 'Neder-Oostenrijk',
      Steiermark: 'Stiermarken',
      Wien: 'Wenen',
      Oberösterreich: 'Opper-Oostenrijk',
      Kärnten: 'Karinthië',
      Tirol: 'Tirol',
      Salzburg: 'Salzburg',
      Vorarlberg: 'Vorarlberg',
    },
    markers: [
      { slug: 'wachau', nl: 'Wachau', lon: 15.45, lat: 48.38 },
    ],
  },

  duitsland: {
    admin: 'Germany',
    label: 'Duitsland',
    projection: () => d3.geoConicConformal().parallels([48, 54]).rotate([-10, 0]),
    // Mosel én Pfalz liggen beide in de Bundesland Rheinland-Pfalz → niet als
    // aparte admin-1 silhouetten te onderscheiden. Daarom puntmarkers binnen het
    // nationale silhouet (alle Bundesländer = inerte context).
    regionMap: {},
    ctxLabels: {
      'Rheinland-Pfalz': 'Rijnland-Palts',
      Bayern: 'Beieren',
      Niedersachsen: 'Nedersaksen',
      Sachsen: 'Saksen',
      'Sachsen-Anhalt': 'Saksen-Anhalt',
      'Nordrhein-Westfalen': 'Noordrijn-Westfalen',
      'Schleswig-Holstein': 'Sleeswijk-Holstein',
      'Mecklenburg-Vorpommern': 'Mecklenburg-Voor-Pommeren',
      Berlin: 'Berlijn',
    },
    markers: [
      { slug: 'mosel-duitsland', nl: 'Mosel', lon: 7.0, lat: 49.9 },
      { slug: 'pfalz', nl: 'Pfalz', lon: 8.13, lat: 49.35 },
    ],
  },

  'zuid-afrika': {
    admin: 'South Africa',
    label: 'Zuid-Afrika',
    // Alle ZA-wijnstreken liggen dicht opeen in de West-Kaap rond Kaapstad →
    // geen aparte admin-1 silhouetten. We zoomen in op de Kaapse wijnlanden
    // (fitBounds) en tekenen elke streek als puntmarker op het West-Kaap-
    // silhouet; de kustlijn levert herkenbare geografische context.
    projection: () => d3.geoConicConformal().parallels([-32, -35]).rotate([-19, 0]),
    fitBounds: [[17.6, -34.9], [20.4, -32.8]],
    regionMap: {},
    // Alleen de West-Kaap als kust-context; overige provincies buiten frame.
    exclude: new Set([
      'KwaZulu-Natal', 'Free State', 'Limpopo', 'North West',
      'Mpumalanga', 'Gauteng', 'Northern Cape', 'Eastern Cape',
    ]),
    ctxLabels: { 'Western Cape': 'West-Kaap' },
    markers: [
      { slug: 'swartland', nl: 'Swartland', lon: 18.73, lat: -33.46 },
      { slug: 'paarl', nl: 'Paarl', lon: 18.97, lat: -33.73 },
      { slug: 'stellenbosch', nl: 'Stellenbosch', lon: 18.86, lat: -33.93 },
      { slug: 'franschhoek', nl: 'Franschhoek', lon: 19.12, lat: -33.91 },
      { slug: 'constantia', nl: 'Constantia', lon: 18.42, lat: -34.03 },
      { slug: 'hemel-en-aarde', nl: 'Hemel-en-Aarde', lon: 19.25, lat: -34.41 },
    ],
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
    const wine = cfg.regionMap[reg];
    // Sub-region-streek: de wijnstreek is een DEELGEBIED van de admin-regio
    // (bv. Langhe = Cuneo+Asti binnen Piemonte, niet heel Piemonte). Marijn
    // (LAT-1659, 06-28): "je pakt nu nog de hele provincie, het moet de regio
    // zijn". We tekenen dan de hele admin-regio als gedempte CONTEXT-onderlaag
    // en het wijn-deelgebied (gedissolvede subset van provincies) als de
    // ingekleurde, klikbare streek erbovenop.
    if (wine && wine.provinces) {
      const subFeats = feats.filter((f) => wine.provinces.includes(f.properties.name));
      const missing = wine.provinces.filter((p) => !feats.some((f) => f.properties.name === p));
      if (missing.length) throw new Error(`provincies ontbreken in region "${reg}": ${missing.join(', ')}`);
      // Gedempte context = de hele admin-regio eromheen.
      dissolved.push({
        region: reg,
        geom: dissolveRegion(feats),
        key: `ctx:${slugify(reg)}`,
        name: wine.parentNl || cfg.ctxLabels?.[reg] || reg,
        wine: false,
      });
      // Ingekleurde wijnstreek = alleen de provincies van het wijngebied.
      dissolved.push({
        region: `${reg}:${wine.slug}`,
        geom: dissolveRegion(subFeats),
        key: wine.slug,
        name: wine.nl,
        wine: true,
      });
      continue;
    }
    const geom = dissolveRegion(feats);
    dissolved.push({
      region: reg,
      geom,
      key: wine ? wine.slug : `ctx:${slugify(reg)}`,
      name: wine ? wine.nl : (cfg.ctxLabels?.[reg] || reg),
      wine: Boolean(wine),
    });
  }

  const projection = cfg.projection();
  if (cfg.fitBounds) {
    // Zoom op een vaste geografische bbox i.p.v. de volledige geometrie. Het
    // silhouet dat buiten de box valt wordt door de SVG-viewBox geclipt. Nodig
    // voor dichtopeen geclusterde streken (bv. de Kaapse wijnlanden) zodat de
    // puntmarkers spreiden i.p.v. samen te klonteren.
    const [[w, s], [e, n]] = cfg.fitBounds;
    projection.fitExtent([[PAD, PAD], [FIT - PAD, FIT - PAD]], {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[w, s], [w, n], [e, n], [e, s], [w, s]]] },
    });
  } else {
    projection.fitExtent([[PAD, PAD], [FIT - PAD, FIT - PAD]], {
      type: 'FeatureCollection',
      features: dissolved.map((d) => ({ type: 'Feature', geometry: d.geom })),
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
