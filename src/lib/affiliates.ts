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

// CJ Booking.com deeplink (LAT-923 → LAT-1400).
// booking_url = plain Booking.com URL uit Directus accommodations.booking_url.
// sid = 'accommodation-{article-slug}' voor CJ-rapportage (gaat in het label als clkid).
//
// LAT-1400: we linken NIET meer via het CJ-tracker-domein www.kqzyfj.com. Dat domein
// staat op ad-blocker/Brave/Safari-tracker-lijsten, waardoor de target=_blank-tab bij
// die bezoekers leeg bleef (booking.com werd nooit bereikt = geen klik, geen commissie).
// In plaats daarvan bouwen we — net als reisjunk.nl — een DIRECTE booking.com-deeplink
// met de Booking-affiliate-`aid` + een CJ-`label` dat publisher/site/clkid draagt. Geen
// blokkeerbaar tussendomein, dus de link werkt ook met een actieve ad-blocker.
export const CJ_CONFIG = {
  /** CJ publisher (PID) — verschijnt als `pub-...` in het label. */
  cjPublisherId: '7938753',
  /** CJ website/site-id (property 101734849) — verschijnt als `site-...` in het label. */
  cjWebsiteId: '101734849',
  /** Booking.com affiliate-id dat de CJ→Booking-redirect aan de finale URL hing. */
  bookingAid: '818285',
  /** Legacy CJ ad/link-id van de oude kqzyfj-hop — bewaard voor traceerbaarheid. */
  legacyEvergreenLinkId: '15734897',
} as const;

// Bouwt het CJ-label dat Booking aan de boeking koppelt: pub-{PID}_site-{siteId}_clkid-{sid}.
function buildCjLabel(sid: string): string {
  return `pub-${CJ_CONFIG.cjPublisherId}_site-${CJ_CONFIG.cjWebsiteId}_clkid-${sid}`;
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
  // Pel een eventuele CJ-redirecthop af vóór we de directe deeplink opbouwen.
  const direct = unwrapCjRedirect(plainBookingUrl);
  try {
    const u = new URL(direct);
    u.searchParams.set('aid', CJ_CONFIG.bookingAid);
    u.searchParams.set('label', buildCjLabel(sid));
    return u.toString();
  } catch {
    // Niet-parseerbare URL → ongewijzigd teruggeven i.p.v. de build breken.
    return direct;
  }
}

// LAT-1549: directe booking.com-zoekdeeplink op adres, mét affiliate-aid + CJ-label.
// Gebruikt als fallback wanneer een verblijf (nog) geen eigen booking.com-property-URL
// in Directus heeft. Dit is een DIRECTE booking.com-link (geen kqzyfj-hop, geen
// Stay22-tussendomein), dus ad-blocker-bestendig én CJ-geattribueerd.
export function buildBookingSearchLink(query: string, sid: string): string {
  try {
    const u = new URL('https://www.booking.com/searchresults.html');
    u.searchParams.set('ss', query);
    u.searchParams.set('aid', CJ_CONFIG.bookingAid);
    u.searchParams.set('label', buildCjLabel(sid));
    return u.toString();
  } catch {
    return 'https://www.booking.com/';
  }
}

// LAT-1775: gedeelde booking-deeplink-resolver voor gecureerde verblijven, gebruikt
// door zowel /streken/<slug>/ (StreekKaart) als /accommodaties/<slug>/ (curated-stays).
// De gecureerde `boeklink` in Directus is een KALE booking.com-URL (vaak /hotel/<slug>),
// zonder aid/label — die resolvet niet en levert geen commissie. NORM (board): aid=818285
// landt structureel op booking.com searchresults, niet op /hotel/. We bouwen daarom ALTIJD
// een directe, ad-blocker-bestendige booking.com-searchresults-deeplink op de exacte
// hotelnaam, mét affiliate-aid + CJ-label. Een eventuele al-gecureerde searchresults-URL
// in de data blijft behouden (alleen aid/label worden gezet/overschreven).
export function accommodatieBookingDeeplink(
  naam: string,
  regio: string,
  boeklink: string | null | undefined,
  sid: string,
): string {
  const direct = boeklink ? unwrapCjRedirect(boeklink.trim()) : '';
  // Al een booking.com-zoekpagina in de data → behoud hem, zet alleen aid + label.
  if (/^https?:\/\/(www\.)?booking\.com\/searchresults/i.test(direct)) {
    return buildCjBookingLink(direct, sid);
  }
  // Kale /hotel/-URL, lege of Stay22/stad-link → directe zoekdeeplink op de hotelnaam.
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
