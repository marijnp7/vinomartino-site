#!/usr/bin/env node
/**
 * gen-overseas-silhouettes.mjs — genereert src/data/atlas/overseas-countries.json
 *
 * Marijn-feedback (LAT-1659, 2026-06-22): de hoofdkaart op /ontdek/ moet wéér op
 * Europa focussen (grote, klikbare landen). Wijnlanden búiten Europa — nu
 * Zuid-Afrika, later Argentinië/Chili/Australië — krijgen een eigen plek "aan de
 * zijkant": kleine kaartjes met de échte landsilhouet, elk klikbaar naar
 * /landen/{slug}/.
 *
 * In plaats van te herprojecteren halen we de silhouetten uit de al geprojecteerde
 * wereldgeometrie (src/data/atlas/world-countries.json, d3 geoNaturalEarth1). Per
 * overzees wijnland normaliseren we het pad naar een eigen, strak passende viewBox
 * zodat het kaartje de vorm herkenbaar en paneelvullend toont.
 *
 *   node scripts/gen-overseas-silhouettes.mjs
 *
 * Nieuw overzees wijnland klikbaar maken = slug toevoegen aan OVERSEAS (de
 * geometrie zit al in world-countries.json) en dit script opnieuw draaien.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src/data/atlas/world-countries.json');
const OUT = resolve(__dirname, '../src/data/atlas/overseas-countries.json');

// Overzeese wijnlanden — getoond in de zijbalk. Volgorde = weergavevolgorde.
// (Geometrie voor al deze landen zit in world-countries.json.)
const OVERSEAS = [
  'zuid-afrika',
  'argentinie',
  'chili',
  'verenigde-staten',
  'australie',
  'nieuw-zeeland',
];

const PAD = 4;     // padding in viewBox-eenheden rond het silhouet
const BOX = 100;   // doel-canvas; silhouet wordt hier passend in geschaald

const world = JSON.parse(readFileSync(SRC, 'utf8')).countries;

function parsePoints(d) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

const r1 = (n) => Math.round(n * 10) / 10;

const out = {
  _meta: {
    description:
      'LAT-1659 — silhouetten van overzeese wijnlanden voor de zijbalk op /ontdek/. ' +
      'Geëxtraheerd uit world-countries.json (d3 geoNaturalEarth1) en per land genormaliseerd ' +
      'naar een eigen viewBox (canvas 100, aspect-behoudend). Nieuw land = slug in ' +
      'scripts/gen-overseas-silhouettes.mjs (OVERSEAS) en regenereren.',
    source: 'src/data/atlas/world-countries.json',
  },
  countries: {},
};

for (const slug of OVERSEAS) {
  const entry = world[slug];
  if (!entry) {
    console.warn(`[gen-overseas] '${slug}' niet gevonden in world-countries.json — overslaan.`);
    continue;
  }
  // bbox over álle subpaths (multipolygoon) zodat de schaal klopt
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of parsePoints(entry.d)) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const scale = (BOX - 2 * PAD) / Math.max(w, h);
  const offX = (BOX - w * scale) / 2;
  const offY = (BOX - h * scale) / 2;
  // Transformeer elk M/L-paar; behoud commando-letters en Z.
  const d = entry.d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, sx, sy) => {
    const nx = (parseFloat(sx) - minX) * scale + offX;
    const ny = (parseFloat(sy) - minY) * scale + offY;
    return `${r1(nx)} ${r1(ny)}`;
  });
  out.countries[slug] = { name: entry.name, viewBox: `0 0 ${BOX} ${BOX}`, d };
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('geschreven:', OUT, '| landen', Object.keys(out.countries).length);
