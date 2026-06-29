// LAT-1644 — gedeelde brug van de gecureerde streek-accommodaties (LAT-1133,
// `streken.accommodaties`) naar het reisjunk-roundup-contract (LAT-1332). De
// gecureerde set is de enige bron die compleet is (3+3+3 per regio) én lat/lng
// draagt, dus draait hij door dezelfde 40-min-clustering (LAT-1406) als de
// /accommodaties-roundup. Zo tonen /streken/<slug>/ ÉN /accommodaties/<slug>/
// dezelfde cluster-layout met tiers GEMENGD binnen een cluster (tier blijft een
// badge per kaart), i.p.v. tier- of plaats-groepering (CEO live-QA LAT-1644).

import type { AccommodatieCluster, AccommodatieKaart, AccommodatieRoundup } from './accommodaties';
import { clusterKaarten } from './accommodatie-cluster';
import { isBookingDeeplink } from './affiliates';
import type { Accommodation, Streek } from './streken';

/** Stabiele slug uit een naam — anker-id + match-sleutel tussen POI en cluster. */
export function staySlug(naam: string): string {
  return naam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'verblijf';
}

/**
 * Best-effort plaats uit een volledig adres. De gecureerde set draagt alleen
 * `adres` (geen los plaats-veld), terwijl de cluster-titels en de "Locatie:"-regel
 * een leesbare plaatsnaam willen. We pakken het deel ná de postcode en strippen
 * een afsluitende provincie-code (bv. "53024 Montalcino SI" → "Montalcino").
 * Lukt dat niet, dan het laatste niet-numerieke, niet-land-deel; anders leeg
 * (de cluster-titel valt dan terug op de regio-naam).
 */
export function plaatsFromAdres(adres: string): string {
  if (!adres) return '';
  const parts = adres.split(',').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/\b\d{4,5}\b\s+(.+)/);
    if (m) return m[1].replace(/\s+[A-Z]{1,3}$/, '').trim();
  }
  const LAND = /^(itali|spanj|frankrijk|portug|duitsl|oosten|grieken|kroat)/i;
  const alpha = parts.filter((p) => !/\d/.test(p) && !LAND.test(p));
  return alpha.length ? alpha[alpha.length - 1] : '';
}

/** Eén gecureerd verblijf → reisjunk-kaartcontract (LAT-1332). */
export function curatedStayToKaart(acc: Accommodation): AccommodatieKaart {
  const boeklink = acc.boeklink && /^https?:\/\//.test(acc.boeklink) ? acc.boeklink : null;
  // LAT-1794: een booking.com-boeklink (kaal of via een legacy CJ-hop) draagt nog
  // GEEN aid/label, dus reiken we hem als `bookingUrl` aan zodat
  // accommodatieBookingHref hem via buildCjBookingLink attribueert (aid + per-
  // property CJ-label `accommodation-{slug}`). Reeds-geattribueerde deeplinks
  // (Stay22 e.a.) blijven ongemoeid via `cjHref`.
  const isBooking = boeklink ? isBookingDeeplink(boeklink) : false;
  return {
    naam: acc.naam,
    slug: staySlug(acc.naam),
    plaats: plaatsFromAdres(acc.adres),
    tier: acc.tier,
    lat: acc.lat,
    lng: acc.lng,
    beschrijving: acc.whyThisOne,
    foto: acc.foto,
    fotoAlt: null,
    prijsLaag: acc.prijsLaag,
    prijsHoog: acc.prijsHoog,
    cjHref: isBooking ? null : boeklink,
    bookingUrl: isBooking ? boeklink : null,
  };
}

/**
 * 40-min-clusters uit de gecureerde streek-accommodaties. Geen accommodaties →
 * lege clusterlijst, zodat de aanroeper netjes terug kan vallen.
 */
export function clustersFromCuratedStays(streek: Streek): AccommodatieCluster[] {
  if (!streek.accommodaties.length) return [];
  return clusterKaarten(streek.accommodaties.map(curatedStayToKaart), streek.name);
}

/** Reisjunk-roundup uit de gecureerde streek-set (LAT-1644). */
export function roundupFromCuratedStays(streek: Streek): AccommodatieRoundup {
  return { regio: streek.name, clusters: clustersFromCuratedStays(streek) };
}
