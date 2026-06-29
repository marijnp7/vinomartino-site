// LAT-1406 — 40-min-clustering voor de reisjunk-roundup. Groepeert verblijven
// die binnen ~40 min rijden van elkaar liggen in één blok (plaatsen door elkaar
// gemengd), en splitst alleen wanneer delen van de streek écht verder uit elkaar
// liggen. Clustering gebeurt op buildtijd uit de lat/lng die in Directus staat
// (HARD RULE 1: data komt uit het CMS).

import type { AccommodatieKaart, AccommodatieCluster } from './accommodaties';
import { STAY_TIER_ORDER } from './stay-tier';

/**
 * Straal (hemelsbrede afstand, km) die we als proxy voor "~40 min rijden"
 * gebruiken. Wegafstand in heuvelachtig wijngebied is grofweg 1,3× de
 * hemelsbrede afstand en de gemiddelde snelheid op streekwegen ligt rond
 * 45-55 km/u, dus 40 min ≈ 30-37 km weg ≈ ~25 km hemelsbreed. Override met
 * ACC_CLUSTER_RADIUS_KM voor fijnafstemming zonder code-wijziging.
 */
function clusterRadiusKm(): number {
  const raw = Number(process.env['ACC_CLUSTER_RADIUS_KM']);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

/** Hemelsbrede afstand (km) tussen twee punten via de haversine-formule. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasCoords(k: AccommodatieKaart): boolean {
  return typeof k.lat === 'number' && typeof k.lng === 'number' && Number.isFinite(k.lat) && Number.isFinite(k.lng);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cluster';
}

/** Tier-volgorde eerst (budget→luxe), daarna alfabetisch op naam; ongetierd achteraan. */
function ordenKaarten(kaarten: AccommodatieKaart[]): AccommodatieKaart[] {
  const tierRank = (k: AccommodatieKaart): number => {
    const i = k.tier ? STAY_TIER_ORDER.indexOf(k.tier) : -1;
    return i === -1 ? STAY_TIER_ORDER.length : i;
  };
  return [...kaarten].sort((a, b) => tierRank(a) - tierRank(b) || a.naam.localeCompare(b.naam));
}

function uniekePlaatsen(kaarten: AccommodatieKaart[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of kaarten) {
    const p = (k.plaats || '').trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function clusterTitel(plaatsen: string[], fallback: string): string {
  if (plaatsen.length === 0) return fallback;
  if (plaatsen.length <= 3) return plaatsen.join(' · ');
  return `${plaatsen.slice(0, 3).join(' · ')} e.a.`;
}

function maakCluster(kaarten: AccommodatieKaart[], fallbackTitel: string): AccommodatieCluster {
  const geordend = ordenKaarten(kaarten);
  const plaatsen = uniekePlaatsen(geordend);
  const titel = clusterTitel(plaatsen, fallbackTitel);
  const slugBron = plaatsen.length ? plaatsen.join('-') : fallbackTitel;
  return { titel, slug: slugify(slugBron), plaatsen, kaarten: geordend };
}

/**
 * Herberekent titel + plaatsen van een cluster op basis van de huidige kaarten,
 * met behoud van de stabiele slug (anker). Nodig nadat kaarten zijn weggefilterd
 * (bv. foto-filter LAT-1371) zodat de titel geen plaats noemt die niet meer
 * zichtbaar is.
 */
export function herbouwClusterWeergave(cluster: AccommodatieCluster): AccommodatieCluster {
  const plaatsen = uniekePlaatsen(cluster.kaarten);
  return { ...cluster, plaatsen, titel: clusterTitel(plaatsen, cluster.titel) };
}

/**
 * Single-linkage clustering: twee verblijven horen bij hetzelfde cluster als ze
 * binnen de straal liggen; transitief (A-B en B-C → A,B,C samen). Zo blijft een
 * aaneengesloten streek één blok en wordt er pas gesplitst bij een echte gap
 * (>40 min). Verblijven zonder coördinaten vallen terug op groeperen per plaats,
 * zodat de build nooit data verliest vóórdat lat/lng is ingevuld.
 */
export function clusterKaarten(kaarten: AccommodatieKaart[], regio: string): AccommodatieCluster[] {
  const radius = clusterRadiusKm();
  const geo = kaarten.filter(hasCoords);
  const zonderCoords = kaarten.filter((k) => !hasCoords(k));

  // Union-find over de geolocaliseerde verblijven.
  const parent = geo.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < geo.length; i++) {
    for (let j = i + 1; j < geo.length; j++) {
      const d = haversineKm(geo[i].lat!, geo[i].lng!, geo[j].lat!, geo[j].lng!);
      if (d <= radius) union(i, j);
    }
  }
  const groups = new Map<number, AccommodatieKaart[]>();
  for (let i = 0; i < geo.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(geo[i]);
  }

  const clusters: AccommodatieCluster[] = [...groups.values()].map((g) => maakCluster(g, regio));

  // Ongelocaliseerde verblijven: groepeer per plaats (oud gedrag), elk een cluster.
  const perPlaats = new Map<string, AccommodatieKaart[]>();
  for (const k of zonderCoords) {
    const key = (k.plaats || '').trim() || regio;
    if (!perPlaats.has(key)) perPlaats.set(key, []);
    perPlaats.get(key)!.push(k);
  }
  for (const [plaats, g] of perPlaats) clusters.push(maakCluster(g, plaats));

  // Deterministische volgorde: alfabetisch op de eerste plaats van het cluster.
  return clusters.sort((a, b) => (a.plaatsen[0] || a.titel).localeCompare(b.plaatsen[0] || b.titel));
}
