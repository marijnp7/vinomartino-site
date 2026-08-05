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
import type { Locale } from './i18n';
import { SUNNYCARS_DEFAULT_DEST, applySunnyCarsLocale } from './affiliate-locale';
import { loadWineRetailPartner, type WineRetailPartner } from './wine-retail';

// LAT-3726 — de wijnretail-partner komt uit de Directus-singleton, net als op de
// wijnhuis-onderbalk (LAT-3493). Dit bestand had een eigen hardcoded
// Grapedistrict-pad; twee paden voor één partner betekent twee affiliate-URL's
// en twee tracker-labels zodra de singleton gevuld wordt.
//
// De URL wordt bewust VERBATIM uit `search_template` opgebouwd, precies zoals
// wineRetailLink() dat doet — dat is het hele punt: één URL-vorm per partner.
// We plakken er dus géén eigen utm-parameters meer overheen; die zouden de
// utm-velden kunnen overschrijven die de partner zelf in de template zet (zelfde
// corruptie-risico dat de sunny-cars-notitie hieronder beschrijft). Wil
// Marketing per-campagne utm's, dan horen die ín de Directus-template. De
// per-plaatsing-attributie zit al op de `data-affiliate-placement`/`-context`
// attributen van de click-tracker, net als bij de andere partners.
//
// Zonder config valt dit terug op het oude hardcoded gedrag, zodat er niets
// verandert zolang de singleton leeg staat.
function buildWineRetailHref(
  query: string,
  context: string,
  partner?: WineRetailPartner | null,
): string {
  if (partner) return partner.searchTemplate.replace('{q}', encodeURIComponent(query.trim()));
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
 *  (aid 818285, ad-blocker-bestendig); `wine-retail` = Grapedistrict (LAT-1780);
 *  `sunny-cars` = autohuur via TradeTracker (LAT-1782, auto-huren-sardinie). */
export type CtaPartner =
  | 'getyourguide'
  | 'booking-awin'
  | 'booking-direct'
  | 'wine-retail'
  | 'sunny-cars';

// LAT-1782 — Sunny Cars (autohuur) loopt buiten de booking/GYG-netwerken. De
// affiliate-deeplink draait via TradeTracker; campagne-id's volgen uit de M&G
// sign-up (zelfde placeholder-patroon als AWIN_AFFID). Tot beide env-id's bekend
// zijn, linken we naar de kale Sunny Cars-deeplink (`bookingUrl`) — werkt, maar
// nog niet ge-attribueerd. `booking-direct` is GEEN alternatief: die helper
// onthopt+her-aid't een booking.com-URL en zou een sunnycars-URL corrumperen.
//
// LAT-2576 — taal: EN-pagina's krijgen de Engelse storefront (`/en`-pad-prefix,
// browser-geverifieerd). De TradeTracker-`u`-doel-URL wordt gelokaliseerd vóór de
// wrap; NL blijft de prefixloze .nl-bestemming.
function buildSunnyCarsHref(link: CtaLink, sid: string, locale: Locale = 'nl'): string {
  const dest = applySunnyCarsLocale(
    (link.bookingUrl && link.bookingUrl.trim())
      ? link.bookingUrl.trim()
      : SUNNYCARS_DEFAULT_DEST[locale],
    locale,
  );
  const campaign = (process.env['TRADETRACKER_SUNNYCARS_CAMPAIGN'] || '').trim();
  const affiliate = (process.env['TRADETRACKER_AFFILIATE_ID'] || '').trim();
  if (!campaign || !affiliate) return dest;
  try {
    const u = new URL('https://tc.tradetracker.net/');
    u.searchParams.set('c', campaign);
    u.searchParams.set('m', '12');
    u.searchParams.set('a', affiliate);
    u.searchParams.set('r', `cta-${sid}`);
    u.searchParams.set('u', dest);
    return u.toString();
  } catch {
    return dest;
  }
}

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
 * Laad de wijnretail-partnerconfig, maar alleen als er in dit blok daadwerkelijk
 * een `wine-retail`-CTA zit (LAT-3726).
 *
 * `resolveCtaHref`/`ctaTrackPartner` zijn synchroon en worden vanuit meerdere
 * `.astro`-componenten aangeroepen; die async maken zou de hele keten omgooien.
 * In plaats daarvan laadt de aanroeper de config één keer in zijn frontmatter —
 * die is al async — en geeft hem als optioneel argument mee. De loader zelf
 * cachet de promise voor de hele build, dus dit blijft één fetch.
 */
export async function loadCtaWineRetail(
  links: Array<CtaLink | null | undefined>,
): Promise<WineRetailPartner | null> {
  if (!links.some((link) => link?.partner === 'wine-retail')) return null;
  return loadWineRetailPartner();
}

/**
 * Resolveer een CtaLink → definitieve href. Centrale routing zodat elke CTA
 * dezelfde tracking-/aid-discipline volgt. `sid` voedt de CJ-/campagnelabel-
 * attributie per plaatsing (bv. `cta-primary-langhe-piemonte`). `locale` (default
 * NL, huidig gedrag) schakelt de affiliate-taalparameters in voor EN-pagina's.
 * `wineRetail` (uit `loadCtaWineRetail`) stuurt het `wine-retail`-pad; weglaten
 * of null → huidig gedrag.
 */
export function resolveCtaHref(
  link: CtaLink,
  sid: string,
  locale: Locale = 'nl',
  wineRetail?: WineRetailPartner | null,
): string {
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
        locale,
      }).href;
    }
    case 'wine-retail':
      return buildWineRetailHref(link.query ?? '', sid, wineRetail);
    case 'sunny-cars':
      return buildSunnyCarsHref(link, sid, locale);
    case 'booking-direct':
    default:
      // aid-818285-norm: expliciete property-URL → onthopt+ge-aid; anders een
      // directe booking.com-SEARCH-landing op de query.
      return link.bookingUrl
        ? buildCjBookingLink(link.bookingUrl, sid, locale)
        : buildBookingSearchLink(link.query ?? '', sid, locale);
  }
}

/**
 * Tracking-partnerlabel voor de click-tracker data-attributen. `wineRetail` (uit
 * `loadCtaWineRetail`) houdt het wijnretail-label gelijk aan
 * `wine_retail_partner.tracker_partner`, zodat dit pad en de wijnhuis-onderbalk
 * niet uit elkaar lopen (LAT-3726).
 */
export function ctaTrackPartner(link: CtaLink, wineRetail?: WineRetailPartner | null): string {
  switch (link.partner) {
    case 'getyourguide':
      return 'getyourguide';
    case 'booking-awin':
    case 'booking-direct':
      return 'booking';
    case 'wine-retail':
      return wineRetail?.trackerPartner || 'grapedistrict';
    case 'sunny-cars':
      return 'sunnycars';
    default:
      return 'unknown';
  }
}

/**
 * Lees de 3-CTA-structuur uit een Directus-entiteit. Default-veld `cta_blocks`
 * (DevOps schema-write, LAT-1784-impl); `field` wijst een alternatief JSON-veld
 * aan, bv. `accom_cta_blocks` voor de accommodatie-surface (LAT-1821) die andere
 * copy nodig heeft dan de streek-CTA. Graceful degradation: ontbrekend of leeg
 * veld → lege structuur, de componenten renderen dan niets.
 */
export function getCtaStructure(
  entity: Record<string, unknown> | null | undefined,
  field: string = 'cta_blocks',
): CtaStructure {
  const raw = entity?.[field];
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') return parsed as CtaStructure;
  } catch {
    // ongeldige JSON → degradeer naar leeg i.p.v. build breken
  }
  return {};
}
