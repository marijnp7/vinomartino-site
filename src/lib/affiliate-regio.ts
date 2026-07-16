// LAT-1676 — Partner-agnostische affiliate-linkbouwer voor de regio-clusters
// (Piemonte-pilot, ReisJunk-leerstukken). Bron: LAT-1672 synthese.
//
// Kernidee (ReisJunk-les): conversie-attributie per bestemming zonder dure
// tooling = één labelconventie `label=[type]-[regio]` (bv. `hotels-piemonte`).
// Het netwerk verschilt per partner, maar het label is overal hetzelfde, zodat
// M&G clicks/boekingen per (type, regio) kan rapporteren in elk netwerk-dashboard.
//
// Partner-keuze (Strategy §3, beslispunt 2): GetYourGuide-first (laagste drempel,
// eigen tracking tot 8%), Booking via Awin als 2e slot. Booking schrapte directe
// affiliates (mei 2025) → daarom Awin-deeplink, nooit een directe Booking-aff-link.
//
// Geen banners. De UI rendert een subtiele "Bekijk beschikbaarheid"-knop
// (AffiliateButton.astro). Deze module levert alleen de URL + het label.
//
// LET OP — affiliate-id's zijn placeholders tot M&G de Awin/GetYourGuide-sign-up
// rond heeft (zustertaak). De labelconventie is hier het contract; M&G hangt de
// echte tracking-id's en de click-meting aan de knop. Vul ECHTE id's via env
// (AWIN_AFFID / GETYOURGUIDE_PARTNER_ID) zodra bekend.

export type AffiliateType =
  | 'hotels'
  | 'agriturismi'
  | 'tours'
  | 'proeverijen'
  | 'restaurants'
  | 'autohuur';

export type AffiliatePartner = 'getyourguide' | 'booking-awin';

export interface AffiliateLinkInput {
  /** Het besteltype, eerste helft van het label (bv. `hotels`). */
  type: AffiliateType;
  /** De regio-slug, tweede helft van het label (bv. `piemonte`). */
  regio: string;
  /** Welk netwerk. Default GetYourGuide (Strategy: laagste drempel). */
  partner?: AffiliatePartner;
  /**
   * Bestemmings-/zoekterm voor de partner (bv. 'La Morra, Piemonte' of een
   * GetYourGuide location-id). Optioneel: zonder term linkt het naar de
   * partner-landingspagina met alleen het tracking-label.
   */
  query?: string;
  /**
   * Voor Booking-via-Awin: de uiteindelijke booking.com-bestemmings-URL die de
   * Awin-redirect omwikkelt (`ued`). Genegeerd voor GetYourGuide.
   */
  bookingUrl?: string;
}

export interface AffiliateLink {
  href: string;
  /** `[type]-[regio]`, exact zoals het in het netwerk-dashboard verschijnt. */
  label: string;
  partner: AffiliatePartner;
}

// Slugificeer een regio-/type-fragment voor het label: lowercase, diacritica weg,
// niet-alfanumeriek → `-`. Zo wordt 'Piëmonte' → 'piemonte', 'La Morra' → 'la-morra'.
function slugFragment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** De labelconventie. Eén bron van waarheid zodat type/regio overal gelijk slugt. */
export function affiliateLabel(type: AffiliateType, regio: string): string {
  return `${slugFragment(type)}-${slugFragment(regio)}`;
}

// AWIN_AFFID blijft placeholder tot M&G de Awin-sign-up rond heeft.
const AWIN_AFFID_PLACEHOLDER = 'VINOMARTINO_AWIN_PENDING';
const AWIN_AFFID = (process.env['AWIN_AFFID'] || AWIN_AFFID_PLACEHOLDER).trim();
const AWIN_BOOKING_MID = (process.env['AWIN_BOOKING_MID'] || '5818').trim(); // Booking.com Awin merchant-id
// GetYourGuide partner_id is publiek (verschijnt in de affiliate-URL), geen secret.
// Default = het echte actieve account CRMZDZ6 (LAT-1688); env kan nog overschrijven.
const GETYOURGUIDE_PARTNER_ID = (process.env['GETYOURGUIDE_PARTNER_ID'] || 'CRMZDZ6').trim();

function buildGetYourGuideLink(label: string, query?: string): string {
  // GetYourGuide partner-deeplink: partner_id + cmp (campagne = ons label).
  // q stuurt de zoekterm; zonder q → algemene landingspagina met tracking.
  const u = new URL('https://www.getyourguide.com/');
  u.searchParams.set('partner_id', GETYOURGUIDE_PARTNER_ID);
  u.searchParams.set('utm_medium', 'online_publisher');
  u.searchParams.set('cmp', label);
  if (query && query.trim()) u.searchParams.set('q', query.trim());
  return u.toString();
}

function buildBookingAwinLink(label: string, query?: string, bookingUrl?: string): string {
  // Awin cread-redirect: awinmid (merchant) + awinaffid (publisher) + clickref (=ons label).
  // `ued` = de uiteindelijke booking.com-deeplink; bij ontbreken bouwen we een
  // booking.com-zoekdeeplink op de query.
  const target = (() => {
    if (bookingUrl && bookingUrl.trim()) return bookingUrl.trim();
    const b = new URL('https://www.booking.com/searchresults.html');
    if (query && query.trim()) b.searchParams.set('ss', query.trim());
    return b.toString();
  })();
  // Graceful degrade (LAT-2531): zolang AWIN_AFFID de placeholder is (Awin-sign-up
  // nog niet rond), levert de cread-redirect een dóde link op — hij tracked niets
  // en stuurt de gebruiker langs een niet-actief affiliate-domein. Dan liever de
  // kále booking.com-bestemming: die werkt voor de lezer en draagt geen kapotte
  // affiliate-wrapper. Zodra AWIN_AFFID via env gezet is (post-sign-up) keert de
  // echte Awin-wrapper vanzelf terug. Fail-closed affiliate-linkguard blijft groen
  // omdat een kale booking.com-search geen aid/label draagt.
  if (AWIN_AFFID === AWIN_AFFID_PLACEHOLDER) return target;
  const u = new URL('https://www.awin1.com/cread.php');
  u.searchParams.set('awinmid', AWIN_BOOKING_MID);
  u.searchParams.set('awinaffid', AWIN_AFFID);
  u.searchParams.set('clickref', label);
  u.searchParams.set('ued', target);
  return u.toString();
}

/**
 * Bouw een partner-agnostische affiliate-link met het `[type]-[regio]`-label.
 * GetYourGuide is de default (Strategy: laagste drempel); Booking loopt via Awin.
 */
export function buildAffiliateLink(input: AffiliateLinkInput): AffiliateLink {
  const partner = input.partner ?? 'getyourguide';
  const label = affiliateLabel(input.type, input.regio);
  const href =
    partner === 'booking-awin'
      ? buildBookingAwinLink(label, input.query, input.bookingUrl)
      : buildGetYourGuideLink(label, input.query);
  return { href, label, partner };
}

// LAT-2252 — GetYourGuide-activiteitenkanaal per streek. Anders dan
// buildGetYourGuideLink (een zóéklink op landingspagina): hier decoreren we een
// concrete, gecureerde tour-deeplink (uit Directus) met de tracking-params.
// De cmp-conventie voor dit kanaal is `streek-<slug>` (zie het ticket), zodat we
// clicks per regio kunnen meten in het GYG-partnerdashboard.
const GYG_HOST_RE = /(^|\.)getyourguide\.[a-z.]+$/i;

/** True als `url` een geldige getyourguide.com-tour-URL is (host-guard). */
export function isGyGTourUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && GYG_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Decoreer een gecureerde GetYourGuide-tour-URL met partner-tracking:
 * partner_id=CRMZDZ6 + utm_medium + cmp=<cmpLabel> (conventie `streek-<slug>`).
 * Geeft de rauwe input ongewijzigd terug als het geen geldige GYG-URL is, zodat
 * één slechte CMS-rij de build niet laat crashen (graceful degrade).
 */
export function decorateGyGTourUrl(tourUrl: string, cmpLabel: string): string {
  if (!isGyGTourUrl(tourUrl)) return tourUrl;
  const u = new URL(tourUrl);
  u.searchParams.set('partner_id', GETYOURGUIDE_PARTNER_ID);
  u.searchParams.set('utm_medium', 'online_publisher');
  u.searchParams.set('cmp', cmpLabel);
  return u.toString();
}
