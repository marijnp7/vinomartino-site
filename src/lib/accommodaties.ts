// LAT-1332 — Datacontract voor het VinoMartino accommodatie-kaart-component
// (reisjunk-model, EPIC LAT-1330). De rijke kaart (foto + naam + locatie +
// beschrijving + prijs-vanaf + CJ-CTA) leeft los van CuratedStayMap.astro
// (kaart + Stay22, voor generieke "waar slapen"). Eén placement = één route.
//
// Dit bestand definieert alleen de presentatie-vorm die de componenten
// consumeren. De Directus-loader (accommodations-collectie, per regio gegroepeerd
// per sub-bestemming) wordt door CTO/DevOps gevuld; foto-URL is op buildtijd al
// gedownload uit DAM → Directus zoals bij de bestaande hero_image-loaders.

import { buildCjBookingLink } from './affiliates';
import { herbouwClusterWeergave } from './accommodatie-cluster';
import type { StayTier } from './stay-tier';

export interface AccommodatieKaart {
  /** Weergavenaam, bv. "Locanda del Pilone". */
  naam: string;
  /** Stabiele slug — gebruikt voor de CJ-SID en als anker-id. */
  slug: string;
  /** Plaats voor de "Locatie: [plaats]"-regel, bv. "La Morra". */
  plaats: string;
  /**
   * Curatie-tier (LAT-1404): budget / prijs-kwaliteit / luxe. Stuurt de
   * tier-badge op de kaart. `null` = nog niet gecureerd → geen badge.
   */
  tier?: StayTier | null;
  /** Breedtegraad — gebruikt voor de 40-min-clustering (LAT-1406). */
  lat?: number | null;
  /** Lengtegraad — gebruikt voor de 40-min-clustering (LAT-1406). */
  lng?: number | null;
  /** 2-4 zinnen persoonlijke beschrijving (wat is uniek). */
  beschrijving: string;
  /**
   * LAT-2061 (VIS-BL-04): cursieve one-liner (~95 tekens) voor de PoiCard.
   * Leeg/`null` = adapter valt terug op `beschrijving`.
   */
  whyRegel?: string | null;
  /** Op buildtijd gedownloade foto-URL (DAM → Directus). Leeg = nette placeholder. */
  foto?: string | null;
  /** Optionele alt-tekst; valt terug op "{naam}, {plaats}". */
  fotoAlt?: string | null;
  /** Laagseizoen-prijs: "Kamer vanaf €X". */
  prijsLaag?: number | null;
  /** Hoogseizoen-prijs: "vanaf €Y". */
  prijsHoog?: number | null;
  /** Vooraf opgeloste CJ-deeplink. Heeft voorrang op bookingUrl. */
  cjHref?: string | null;
  /** Kale Booking.com-URL uit Directus; wordt at-render met CJ omwikkeld. */
  bookingUrl?: string | null;
  /**
   * LAT-1775: bron-valuta van de prijs op deze kaart (per-verblijf, bv. 'ZAR' voor
   * Constantia). Heeft voorrang op de pagina-brede bron-valuta zodat de conversie de
   * échte bron volgt i.p.v. een land-aanname. Leeg = val terug op pagina-valuta (EUR).
   */
  bronValuta?: string | null;
}

/**
 * Eén reis-cluster (LAT-1406): verblijven die binnen ~40 min rijden van elkaar
 * liggen, gemengd over plaatsen heen. Vervangt de oude strikte rij-per-plaats:
 * een cluster kan meerdere plaatsen omvatten en wordt alleen gesplitst als
 * delen van de streek écht >40 min uit elkaar liggen.
 */
export interface AccommodatieCluster {
  /** Weergavetitel, bv. "Barolo · La Morra · Monforte" of een enkele plaats. */
  titel: string;
  /** Anker-id voor de sprong-navigatie. */
  slug: string;
  /** De afzonderlijke plaatsen binnen dit cluster (voor context/labels). */
  plaatsen: string[];
  /** Kaarten, gemengd over plaatsen en gesorteerd op tier (budget→luxe). */
  kaarten: AccommodatieKaart[];
}

export interface AccommodatieRoundup {
  /** Regio-naam, bv. "Piemonte". */
  regio: string;
  /** 40-min-clusters binnen de streek (LAT-1406). */
  clusters: AccommodatieCluster[];
}

/**
 * Lost de booking-CTA op naar een CJ-deeplink met unieke SID per property
 * (SID-conventie `accommodation-{slug}`, gelijk aan resolveAccommodationHref).
 * Voorkeur: vooraf opgeloste cjHref. Anders: kale bookingUrl omwikkelen.
 * Geen geldige bron → null (component verbergt dan de CTA).
 */
export function accommodatieBookingHref(kaart: AccommodatieKaart): string | null {
  if (kaart.cjHref && /^https?:\/\//.test(kaart.cjHref)) return kaart.cjHref;
  if (kaart.bookingUrl && /^https?:\/\//.test(kaart.bookingUrl)) {
    return buildCjBookingLink(kaart.bookingUrl, `accommodation-${kaart.slug}`);
  }
  return null;
}

/**
 * LAT-1371: op een overzichtspagina mag GEEN placeholder/AI-foto staan — alleen
 * kaarten met een echte (gedownloade) DAM-foto. Filtert de roundup tot kaarten
 * met `foto` en laat sub-groepen vallen die daardoor leeg raken.
 */
export function filterRoundupOpFotos(roundup: AccommodatieRoundup): AccommodatieRoundup {
  const clusters = roundup.clusters
    .map((c) => ({ ...c, kaarten: c.kaarten.filter((k) => Boolean(k.foto)) }))
    .filter((c) => c.kaarten.length > 0)
    .map(herbouwClusterWeergave);
  return { ...roundup, clusters };
}

/** Aantal foto-gedekte kaarten in een roundup. */
export function roundupKaartAantal(roundup: AccommodatieRoundup): number {
  return roundup.clusters.reduce((n, c) => n + c.kaarten.filter((k) => Boolean(k.foto)).length, 0);
}
