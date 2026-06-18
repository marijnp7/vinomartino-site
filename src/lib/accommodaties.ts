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

export interface AccommodatieKaart {
  /** Weergavenaam, bv. "Locanda del Pilone". */
  naam: string;
  /** Stabiele slug — gebruikt voor de CJ-SID en als anker-id. */
  slug: string;
  /** Plaats voor de "Locatie: [plaats]"-regel, bv. "La Morra". */
  plaats: string;
  /** 2-4 zinnen persoonlijke beschrijving (wat is uniek). */
  beschrijving: string;
  /** Op buildtijd gedownloade foto-URL (DAM → Directus). Leeg = nette placeholder. */
  foto?: string | null;
  /** Optionele alt-tekst; valt terug op "{naam} — {plaats}". */
  fotoAlt?: string | null;
  /** Laagseizoen-prijs: "Kamer vanaf €X". */
  prijsLaag?: number | null;
  /** Hoogseizoen-prijs: "vanaf €Y". */
  prijsHoog?: number | null;
  /** Vooraf opgeloste CJ-deeplink. Heeft voorrang op bookingUrl. */
  cjHref?: string | null;
  /** Kale Booking.com-URL uit Directus; wordt at-render met CJ omwikkeld. */
  bookingUrl?: string | null;
}

export interface AccommodatieSubgroep {
  /** Sub-bestemming, bv. "Barolo" — toont in sprong-nav + sectie-header. */
  plaats: string;
  /** Anker-id voor de sprong-navigatie. */
  slug: string;
  kaarten: AccommodatieKaart[];
}

export interface AccommodatieRoundup {
  /** Regio-naam, bv. "Piemonte". */
  regio: string;
  subgroepen: AccommodatieSubgroep[];
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
  const subgroepen = roundup.subgroepen
    .map((g) => ({ ...g, kaarten: g.kaarten.filter((k) => Boolean(k.foto)) }))
    .filter((g) => g.kaarten.length > 0);
  return { ...roundup, subgroepen };
}

/** Aantal foto-gedekte kaarten in een roundup. */
export function roundupKaartAantal(roundup: AccommodatieRoundup): number {
  return roundup.subgroepen.reduce((n, g) => n + g.kaarten.filter((k) => Boolean(k.foto)).length, 0);
}
