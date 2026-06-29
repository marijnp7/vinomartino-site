// LAT-1784 — Affiliate-discipline: gestandaardiseerde 3-CTA-structuur.
//
// Probleem (CEO/epic LAT-1779): "booking" komt mechanisch terug op elke pagina.
// Minder, maar slimmer. Daarom één herbruikbaar contract met EXACT drie CTA-
// momenten per commerciële pagina, elk met een verplichte onderbouwing:
//   1. hoofd-CTA bovenaan (bij koopintentie)
//   2. vergelijkingsblok halverwege
//   3. afsluitende aanbeveling
//
// Dit bestand levert ALLEEN het contract + de link-resolver. De onderbouwende
// copy (`why`/`intro`/`recommendation`) komt uit Directus (DAM → Directus →
// rebuild) en wordt door Lead Editor geschreven (LAT-1782). De page-templates
// mounten de discrete componenten (CtaPrimary/CtaComparison/CtaClosing) op de
// juiste scrollpositie; money-pages en de landen-hub (LAT-1786) hergebruiken
// hetzelfde contract.
//
// NORM (CEO 2026-06-29): affiliate-aid 818285 = searchresults-landing. We linken
// dus naar een ZOEK-landingspagina (query), nooit naar een /hotel/-deeplink.

import { buildAffiliateLink, type AffiliateType, type AffiliatePartner } from './affiliate-regio';
import { buildBookingSearchLink, buildCjBookingLink } from './affiliates';

// Wijn-retail (Grapedistrict) landt nog op de feature-branch van LAT-1780. Tot
// die merge houden we de resolver onafhankelijk met een lokale, identiek
// gedragende helper. Na merge kan dit door affiliates.buildWineRetailLink.
function buildWineRetailHref(query: string, context: string): string {
  const base = 'https://www.grapedistrict.nl';
  const affiliateId = (process.env['GRAPEDISTRICT_AFFILIATE_ID'] || '').trim();
  if (!affiliateId) return `${base}/search?q=${encodeURIComponent(query)}`;
  try {
    const u = new URL(`${base}/search`);
    u.searchParams.set('q', query);
    u.searchParams.set('aff_id', affiliateId);
    u.searchParams.set('utm_source', 'vinomartino');
    u.searchParams.set('utm_medium', 'affiliate');
    u.searchParams.set('utm_campaign', context);
    return u.toString();
  } catch {
    return `${base}/search?q=${encodeURIComponent(query)}`;
  }
}

/** Welk netwerk de CTA aanstuurt. `booking-direct` = directe booking.com search
 *  (aid 818285, ad-blocker-bestendig); `wine-retail` = Grapedistrict (LAT-1780). */
export type CtaPartner =
  | 'getyourguide'
  | 'booking-awin'
  | 'booking-direct'
  | 'wine-retail';

/** Linkconfig van één CTA. Géén copy — alleen routing + tracking. */
export interface CtaLink {
  partner: CtaPartner;
  /** Labelhelft voor GYG/Awin tracking (`[type]-[regio]`). */
  type?: AffiliateType;
  regio?: string;
  /** Zoekterm → searchresults-landing (de aid-818285-norm). Verplicht voor
   *  booking-direct/booking-awin/wine-retail; optioneel voor GYG-landing. */
  query?: string;
  /** Expliciete booking.com-property-URL (alleen als die in Directus staat).
   *  Wordt at-render via buildCjBookingLink onthopt + ge-aid. */
  bookingUrl?: string;
  /** Knoptekst. Default per component. */
  label?: string;
}

export interface CtaPrimaryData {
  heading?: string;
  /** "Waarom dit logisch is" — verplicht. */
  why: string;
  link: CtaLink;
}

export interface CtaComparisonOption {
  /** Optionele tier-koppeling (sluit aan op stay-tier.ts: slim_geboekt /
   *  prijs_kwaliteit / pure_luxe), of vrij label voor andere vergelijkingen. */
  tier?: string;
  title: string;
  why: string;
  link: CtaLink;
}

export interface CtaComparisonData {
  heading?: string;
  intro?: string;
  /** Waarom een vergelijking hier logisch is. */
  why: string;
  /** 2–3 opties. Meer wordt afgekapt door de component (geen banner-wand). */
  options: CtaComparisonOption[];
}

export interface CtaClosingData {
  heading?: string;
  /** De redactionele eindaanbeveling (Lead Editor). */
  recommendation: string;
  why: string;
  link: CtaLink;
}

/** Eén Directus-veld `cta_blocks` (JSON) per commerciële entiteit draagt dit. */
export interface CtaStructure {
  primary?: CtaPrimaryData;
  comparison?: CtaComparisonData;
  closing?: CtaClosingData;
}

/**
 * Resolveer een CtaLink → definitieve href. Centrale routing zodat elke CTA
 * dezelfde tracking-/aid-discipline volgt. `sid` voedt de CJ-/campagnelabel-
 * attributie per plaatsing (bv. `cta-primary-langhe-piemonte`).
 */
export function resolveCtaHref(link: CtaLink, sid: string): string {
  switch (link.partner) {
    case 'getyourguide':
    case 'booking-awin': {
      const partner: AffiliatePartner =
        link.partner === 'booking-awin' ? 'booking-awin' : 'getyourguide';
      return buildAffiliateLink({
        type: (link.type ?? 'hotels') as AffiliateType,
        regio: link.regio ?? sid,
        partner,
        query: link.query,
        bookingUrl: link.bookingUrl,
      }).href;
    }
    case 'wine-retail':
      return buildWineRetailHref(link.query ?? '', sid);
    case 'booking-direct':
    default:
      // aid-818285-norm: expliciete property-URL → onthopt+ge-aid; anders een
      // directe booking.com-SEARCH-landing op de query.
      return link.bookingUrl
        ? buildCjBookingLink(link.bookingUrl, sid)
        : buildBookingSearchLink(link.query ?? '', sid);
  }
}

/** Tracking-partnerlabel voor de click-tracker data-attributen. */
export function ctaTrackPartner(link: CtaLink): string {
  switch (link.partner) {
    case 'getyourguide':
      return 'getyourguide';
    case 'booking-awin':
    case 'booking-direct':
      return 'booking';
    case 'wine-retail':
      return 'grapedistrict';
    default:
      return 'unknown';
  }
}

/**
 * Lees de 3-CTA-structuur uit een Directus-entiteit. Verwacht een JSON-veld
 * `cta_blocks` (DevOps schema-write, LAT-1784-impl). Graceful degradation:
 * ontbrekend of leeg veld → lege structuur, de componenten renderen dan niets.
 */
export function getCtaStructure(
  entity: Record<string, unknown> | null | undefined,
): CtaStructure {
  const raw = entity?.['cta_blocks'];
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') return parsed as CtaStructure;
  } catch {
    // ongeldige JSON → degradeer naar leeg i.p.v. build breken
  }
  return {};
}
