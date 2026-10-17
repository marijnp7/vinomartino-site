#!/usr/bin/env node
// LAT-13816 — berekent per wijnroute de echte wegroute per dag en schrijft
// src/data/route-lines/<slug>.json (+ <slug>.svg, de routeschets voor de hub).
//
// HANDMATIG draaien, nooit in CI: de site mag niet afhangen van een externe router.
// Commit de uitvoer. OSRM-demo (router.project-osrm.org) alleen voor deze eenmalige
// builds, met een pauze tussen requests.
//
// Bron van de stops (zelfde volgorde als src/lib/routes.ts):
//   itinerary.days[].stops + overnachting (dag = day.n), anders routes.stops_geo
//   met een `dag`-veld. Routes zonder dagindeling worden overgeslagen.
//
// Gebruik:
//   DIRECTUS_URL=… DIRECTUS_TOKEN=… node scripts/build-route-lines.mjs [--slug s] [--dry-run]
//   node scripts/build-route-lines.mjs --input routes.json [--slug s]
//     (routes.json = [{ slug, itinerary, stops_geo }], bv. via directus-run-internal.sh)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'src/data/route-lines');
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const PAUZE_MS = 1500;
const TOLERANTIE_M = 5;

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const onlySlug = arg('--slug');
const input = arg('--input');
const dryRun = args.includes('--dry-run');

async function loadRoutes() {
  if (input) return JSON.parse(readFileSync(input, 'utf8'));
  const base = process.env.DIRECTUS_URL;
  if (!base) throw new Error('DIRECTUS_URL ontbreekt (of gebruik --input)');
  const q = new URLSearchParams({ fields: 'slug,itinerary,stops_geo', limit: '-1', 'filter[status][_eq]': 'published' });
  if (onlySlug) q.set('filter[slug][_eq]', onlySlug);
  const res = await fetch(`${base}/items/routes?${q}`, {
    headers: process.env.DIRECTUS_TOKEN ? { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`Directus ${res.status}`);
  return (await res.json()).data;
}

const parse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
const fin = (n) => n != null && Number.isFinite(Number(n));

/** Stops met dag, in routevolgorde. */
export function stopsMetDag(route) {
  const it = parse(route.itinerary);
  const out = [];
  if (it && Array.isArray(it.days)) {
    for (const d of it.days) {
      for (const s of d.stops ?? []) if (fin(s.lat) && fin(s.lng)) out.push({ naam: s.naam, lat: +s.lat, lng: +s.lng, dag: d.n, kind: s.kind });
      const o = d.overnachting;
      if (o && fin(o.lat) && fin(o.lng)) out.push({ naam: o.naam, lat: +o.lat, lng: +o.lng, dag: d.n, kind: 'slaap' });
    }
  }
  if (out.length >= 2) return out;
  const geo = parse(route.stops_geo);
  return Array.isArray(geo) ? geo.filter((s) => fin(s.lat) && fin(s.lng) && Number.isInteger(Number(s.dag)))
    .map((s) => ({ naam: s.naam, lat: +s.lat, lng: +s.lng, dag: Number(s.dag), kind: s.kind ?? 'stop' })) : [];
}

/** Waypoints per dag: start bij de slaapplek van de vorige dag, eindig bij die van vandaag. */
export function waypointsPerDag(stops) {
  const dagen = [...new Set(stops.map((s) => s.dag))].sort((a, b) => a - b);
  let vorige = null;
  return dagen.map((dag) => {
    const v = stops.filter((s) => s.dag === dag);
    const pts = [...(vorige ? [vorige] : []), ...v].filter((p, i, a) => i === 0 || p.lat !== a[i - 1].lat || p.lng !== a[i - 1].lng);
    const slaap = [...v].reverse().find((s) => s.kind === 'slaap');
    if (slaap) vorige = slaap;
    return { dag, pts };
  });
}

// Douglas-Peucker in meters (equirectangulaire projectie, ruim genoeg op routeschaal).
export function simplify(coords, tol = TOLERANTIE_M) {
  if (coords.length < 3) return coords;
  const lat0 = (coords[0][0] * Math.PI) / 180;
  const xy = coords.map(([la, ln]) => [ln * 111320 * Math.cos(lat0), la * 110540]);
  const keep = new Uint8Array(coords.length); keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return coords.filter((_, i) => keep[i]);
}

/** SVG-pad van alle dagen samen, geschaald in viewBox 160x110 met 10 px marge. */
export function sketchPath(days) {
  const all = days.flatMap((d) => d.coords);
  const lats = all.map((c) => c[0]), lngs = all.map((c) => c[1]);
  const [minLa, maxLa, minLn, maxLn] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const kx = Math.cos((((minLa + maxLa) / 2) * Math.PI) / 180);
  const w = (maxLn - minLn) * kx || 1e-9, h = maxLa - minLa || 1e-9;
  const s = Math.min(140 / w, 90 / h);
  const ox = 10 + (140 - w * s) / 2, oy = 10 + (90 - h * s) / 2;
  return days.map((d) => simplify(d.coords, 60).map(([la, ln], i) =>
    `${i ? 'L' : 'M'}${(ox + (ln - minLn) * kx * s).toFixed(1)} ${(oy + (maxLa - la) * s).toFixed(1)}`).join('')).join('');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function osrm(pts) {
  const url = `${OSRM}/${pts.map((p) => `${p.lng},${p.lat}`).join(';')}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VinoMartino route-lines (LAT-13816)' } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error(`OSRM ${j.code}`);
  const r = j.routes[0];
  return { meters: Math.round(r.distance), seconds: Math.round(r.duration), coords: r.geometry.coordinates.map(([ln, la]) => [la, ln]) };
}

async function main() {
  const routes = (await loadRoutes()).filter((r) => !onlySlug || r.slug === onlySlug);
  if (!dryRun) mkdirSync(OUT, { recursive: true });
  for (const route of routes) {
    const stops = stopsMetDag(route);
    if (!stops.length) { console.log(`skip ${route.slug}: geen dagindeling`); continue; }
    const days = [];
    for (const { dag, pts } of waypointsPerDag(stops)) {
      if (pts.length < 2) continue;
      const r = await osrm(pts);
      days.push({ dag, meters: r.meters, seconds: r.seconds,
        coords: simplify(r.coords).map(([la, ln]) => [+la.toFixed(5), +ln.toFixed(5)]) });
      console.log(`${route.slug} dag ${dag}: ${(r.meters / 1000).toFixed(1)} km, ${Math.round(r.seconds / 60)} min, ${pts.map((p) => p.naam).join(' > ')}`);
      await sleep(PAUZE_MS);
    }
    if (!days.length) continue;
    const line = {
      slug: route.slug,
      source: 'OSRM demo (router.project-osrm.org), OpenStreetMap-data, driving',
      generatedAt: new Date().toISOString(),
      totalMeters: days.reduce((s, d) => s + d.meters, 0),
      days,
      sketch: sketchPath(days),
    };
    const json = JSON.stringify(line);
    console.log(`${route.slug}: totaal ${(line.totalMeters / 1000).toFixed(1)} km, ${(json.length / 1024).toFixed(1)} KB`);
    if (dryRun) continue;
    writeFileSync(path.join(OUT, `${route.slug}.json`), json + '\n');
    writeFileSync(path.join(OUT, `${route.slug}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 110"><rect width="160" height="110" fill="#14100E"/><path d="${line.sketch}" fill="none" stroke="#F2C14E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
