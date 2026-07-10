// LAT-1029 — Affiliate block config per article (M1-Optie B).
// Architectuur (PROJECT_BRIEF par. 3.0 + LAT-923):
//   - booking_url per accommodatie leeft in Directus accommodations.booking_url (plain URL)
//   - CJ-wrapper wordt at render time toegepast via buildCjBookingLink()
//   - affiliates.ts bevat: CJ-config, editorial metadata, accommodationId-verwijzingen
//   - Geen losse Booking.com-URLs in deze file

export type AffiliateLocation = 'accommodation' | 'activity' | 'sidebar';
export type AffiliateLinkBron = 'Booking.com' | 'GetYourGuide' | 'directe link';

export interface AffiliateBlockConfig {
  location: AffiliateLocation;
  producent: string;
  bezoekMaand: string;
  bezoekJaar: number;
  linkBron: AffiliateLinkBron;
  href?: string;           // voor directe-link entries
  accommodationId?: number; // voor Booking.com entries — resolved from Directus at build time
  ctaLabel?: string;
  description?: string;
}

// CJ Booking.com deeplink (LAT-923 → LAT-1400 → LAT-2251).
// booking_url = plain Booking.com URL uit Directus accommodations.booking_url.
// sid = per-pagina/per-property SubID voor CJ-rapportage (gaat als `sid` mee in de klik).
//
// LAT-2251 (live geverifieerd 2026-07-10): CJ registreerde ~0 kliks / EUR 0 commissie.
// Root cause = de directe booking.com-deeplink met alleen `aid` + handgebouwd `label`
// (de LAT-1400-aanpak) passeert het CJ-klikdomein NIET. `aid`/`label` horen bij Booking's
// EIGEN affiliate-programma; Commission Junction attribueert een klik alléén als hij door
// het CJ-redirectdomein (kqzyfj.com / dpbolvw.net / anrdoezrs.net) loopt. Zonder die hop
// is er geen enkele CJ-klik, hoe goed de property-deeplink ook is.
//
// Fix: wrap élke booking.com-deeplink door de evergreen CJ-klik-URL, met de schone
// property-deeplink als url-parameter en een per-pagina `sid`:
//   https://www.kqzyfj.com/click-{website}-{link}?url={encodeURIComponent(booking)}&sid={sid}
//
// Trade-off (bekend uit LAT-1400): kqzyfj.com staat op sommige ad-blocker-lijsten. Dat
// kost een deel van de ad-blocker-bezoekers, maar zonder de CJ-hop is er ZERO attributie
// voor iedereen. Netto positief; monitor CJ-clicks 24-48u na deploy.
export const CJ_CONFIG = {
  /** CJ publisher (PID) — publisher 7938753 in het CJ-dashboard. */
  cjPublisherId: '7938753',
  /** CJ website/property-id VinoMartino — eerste segment van de click-URL. */
  cjWebsiteId: '101734849',
  /** CJ evergreen link-id (advertiser Booking.com BENELUX 4347407). */
  cjLinkId: '15734897',
} as const;

/** CJ-klikdomein voor de redirect-hop (kqzyfj.com = dpbolvw.net = anrdoezrs.net). */
const CJ_CLICK_BASE = 'https://www.kqzyfj.com';

// Wrap een schone booking.com-deeplink door de evergreen CJ-klik-URL. De property-URL
// gaat correct ge-encodeURIComponent als `url`-param mee; `sid` draagt de per-pagina SubID.
function cjClickWrap(finalBookingUrl: string, sid: string): string {
  const u = new URL(`${CJ_CLICK_BASE}/click-${CJ_CONFIG.cjWebsiteId}-${CJ_CONFIG.cjLinkId}`);
  u.searchParams.set('url', finalBookingUrl);
  u.searchParams.set('sid', sid);
  return u.toString();
}

// CJ-redirectdomeinen (de blokkeerbare tussenhops). Een legacy boeklink kan nog
// in dit formaat in Directus staan: `https://www.kqzyfj.com/click-PID-ADID?url=<booking.com>`.
// LAT-1549: we pellen die hop er at-render-time af zodat de uiteindelijke link
// ALTIJD een directe booking.com-deeplink wordt — onafhankelijk van wat de data bevat.
const CJ_REDIRECT_HOSTS = [
  'kqzyfj.com', 'anrdoezrs.net', 'jdoqocy.com', 'dpbolvw.net', 'tkqlhce.com',
  'ftjcfx.com', 'lduhtrp.net', 'emjcd.com', 'qksrv.net', 'awltovhc.com', 'cj.dotomi.com',
];

export function unwrapCjRedirect(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const isCjHop = CJ_REDIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    if (!isCjHop) return raw;
    const target = u.searchParams.get('url');
    if (!target) return raw;
    try { return decodeURIComponent(target); } catch { return target; }
  } catch {
    return raw;
  }
}

export function buildCjBookingLink(plainBookingUrl: string, sid: string): string {
  // Pel een eventuele bestaande CJ-hop af, normaliseer naar de schone property-deeplink.
  const direct = unwrapCjRedirect(plainBookingUrl);
  try {
    const u = new URL(direct);
    // Strip de oude Booking-eigen affiliate-params: CJ hangt zelf zijn attributie aan
    // de redirect; een losse `aid`/`label` (ander programma) zou conflicteren.
    u.searchParams.delete('aid');
    u.searchParams.delete('label');
    // LAT-1964: keep_landing=1 houdt een /hotel/-deeplink op de property-pagina zelf.
    if (/\/hotel\//i.test(u.pathname)) u.searchParams.set('keep_landing', '1');
    // LAT-2251: wrap de schone deeplink door het CJ-klikdomein voor attributie.
    return cjClickWrap(u.toString(), sid);
  } catch {
    // Niet-parseerbare URL → ongewijzigd teruggeven i.p.v. de build breken.
    return direct;
  }
}

// LAT-1549 → LAT-2251: booking.com-zoekdeeplink op adres, gewrapt door het CJ-klikdomein.
// Gebruikt als fallback wanneer een verblijf (nog) geen eigen booking.com-property-URL
// in Directus heeft.
export function buildBookingSearchLink(query: string, sid: string): string {
  try {
    const u = new URL('https://www.booking.com/searchresults.html');
    u.searchParams.set('ss', query);
    return cjClickWrap(u.toString(), sid);
  } catch {
    return `${CJ_CLICK_BASE}/click-${CJ_CONFIG.cjWebsiteId}-${CJ_CONFIG.cjLinkId}`;
  }
}

// LAT-1775/LAT-1964: gedeelde booking-deeplink-resolver voor gecureerde verblijven,
// gebruikt door zowel /streken/<slug>/ (StreekKaart) als /accommodaties/<slug>/
// (curated-stays). De gecureerde `boeklink` in Directus is een KALE booking.com-URL
// (vaak /hotel/<slug>), zonder aid/label.
//
// LAT-1964 (koersnota 2026-07-02): de eerdere LAT-1775-norm gooide die /hotel/-URL
// weg en zocht ALTIJD op hotelnaam (searchresults) — dat lekt commissie en landt de
// bezoeker op een zoeklijst i.p.v. de property. Die norm rustte op de aanname dat
// aid=818285 niet op /hotel/ kan landen. Browser-DOM-verificatie (2026-07-02, Château
// de Challanges) weerlegt dat: aid=818285 + /hotel/ landt gewoon op de hotelpagina.
// We gebruiken daarom nu de property-deeplink wanneer die er is:
//   1. booking.com/hotel/<slug>  → directe property-deeplink (buildCjBookingLink,
//      krijgt keep_landing=1).
//   2. booking.com/searchresults → behoud, zet alleen aid + label.
//   3. leeg / Stay22 / stad-link  → best-effort zoekdeeplink op de hotelnaam.
export function accommodatieBookingDeeplink(
  naam: string,
  regio: string,
  boeklink: string | null | undefined,
  sid: string,
): string {
  const direct = boeklink ? unwrapCjRedirect(boeklink.trim()) : '';
  // Property-deeplink of al-gecureerde zoekpagina in de data → behoud host+pad,
  // zet aid + label (en keep_landing op /hotel/). Geen commissielek meer.
  if (/^https?:\/\/(www\.)?booking\.com\/(hotel|searchresults)/i.test(direct)) {
    return buildCjBookingLink(direct, sid);
  }
  // Lege of Stay22/stad-link → best-effort zoekdeeplink op de hotelnaam.
  return buildBookingSearchLink(regio ? `${naam}, ${regio}` : naam, sid);
}

// Fetches booking_url + slug from Directus accommodations by ID and wraps with CJ.
// SID = 'accommodation-{accommodation-slug}' for per-property attribution in CJ reports.
// Called at build time from the article template.
export async function resolveAccommodationHref(
  accommodationId: number,
): Promise<string | undefined> {
  const url = (process.env['DIRECTUS_URL'] || '').trim();
  const token = (process.env['DIRECTUS_TOKEN'] || '').trim();
  if (!url || !token) return undefined;

  try {
    const res = await fetch(`${url}/items/accommodations/${accommodationId}?fields=slug,booking_url`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { data?: { slug?: string; booking_url?: string } };
    const bookingUrl = data?.data?.booking_url;
    const slug = data?.data?.slug;
    if (!bookingUrl || !slug) return undefined;
    return buildCjBookingLink(bookingUrl, `accommodation-${slug}`);
  } catch {
    return undefined;
  }
}

export const AFFILIATE_BLOCKS: Record<string, AffiliateBlockConfig[]> = {
  // === M1 ENTRIES ===
  // Activation governance: Content Writer ([LAT-1030](/LAT/issues/LAT-1030)) verifieert
  // bezoek-doc per producent; Lead Editor maakt finale call. Geen affiliate-blok zonder
  // bevestigd bezoek-bewijs (Lead Editor regel #2 van /over-ons).

  // Langhe — Piemonte-pillar (Oktober 2024-trip).
  // Locanda del Pilone (accommodationId=11) + Palazzo Finati (accommodationId=12):
  // booking_url in Directus, CJ-wrapper at render time (LAT-923).
  'een-week-in-piemonte-barolo-barbaresco-en-alles-daartussenin': [
    {
      location: 'activity',
      producent: 'Produttori del Barbaresco',
      bezoekMaand: 'Oktober',
      bezoekJaar: 2024,
      linkBron: 'directe link',
      href: 'https://www.produttoridelbarbaresco.com',
      ctaLabel: 'Plan je bezoek',
    },
    {
      location: 'accommodation',
      producent: 'Locanda del Pilone',
      bezoekMaand: 'Juli',
      bezoekJaar: 2021,
      linkBron: 'Booking.com',
      accommodationId: 11,
      ctaLabel: 'Bekijk beschikbaarheid',
      description: 'Modern boutique-hotel boven de Langhe bij La Morra, €140 per nacht. Panoramisch uitzicht over de wijngaarden.',
    },
    {
      location: 'sidebar',
      producent: 'Palazzo Finati',
      bezoekMaand: 'Juli',
      bezoekJaar: 2021,
      linkBron: 'Booking.com',
      accommodationId: 12,
      ctaLabel: 'Bekijk beschikbaarheid',
      description: 'Historisch palazzo in het centrum van Alba, €135 per nacht. Beste vertrekpunt voor de restaurantavonden.',
    },
  ],

  // Etna — Benanti ❌ Lead Editor: portret-link vervalt. Streekpagina-vermelding
  // op /streken/etna/ blijft (enoteca-tasting format) MET wijnwinkel-affiliate-link.
  // Geen affiliate-blok op `etna-wijnreis-drie-dagen-vulkaan` voor M1.

  // Toscane — Tenuta di Capezzana (activity, ✅ Lead Editor go LAT-1030 comment 27226cc5).
  // Brolio Agriroom (accommodationId=1): booking_url in Directus, CJ-wrapper at render time (LAT-923).
  'wijnreizen-toscane-voorbij-de-toeristische-chianti-route': [
    {
      location: 'activity',
      producent: 'Tenuta di Capezzana',
      bezoekMaand: 'Oktober',
      bezoekJaar: 2024,
      linkBron: 'directe link',
      href: 'https://www.capezzana.it/visita-e-degustazioni/',
      ctaLabel: 'Reserveer proeverij',
    },
    {
      location: 'accommodation',
      producent: 'Brolio Agriroom (Castello di Brolio)',
      bezoekMaand: 'Mei',
      bezoekJaar: 2024,
      linkBron: 'Booking.com',
      accommodationId: 1,
      ctaLabel: 'Bekijk beschikbaarheid',
      description: "Vier kamers boven het Eroica Caffè op het domein van Barone Ricasoli. Wij liepen er 's ochtends door de wijngaarden naar de kasteelmuren.",
    },
  ],

  // Langhe 4-daagse route — Produttori del Barbaresco activity (LAT-1030)
  'langhe-piemonte-4-dagen-route': [
    {
      location: 'activity',
      producent: 'Produttori del Barbaresco',
      bezoekMaand: 'Februari',
      bezoekJaar: 2026,
      linkBron: 'directe link',
      href: 'https://www.produttoridelbarbaresco.com',
      ctaLabel: 'Plan je bezoek',
    },
  ],
};

export function getAffiliateBlocks(slug: string): AffiliateBlockConfig[] {
  return AFFILIATE_BLOCKS[slug] ?? [];
}

export function getAffiliateBlock(
  slug: string,
  location: AffiliateLocation,
): AffiliateBlockConfig | undefined {
  return getAffiliateBlocks(slug).find((b) => b.location === location);
}
