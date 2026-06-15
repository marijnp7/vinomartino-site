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

// CJ Booking.com wrapper (LAT-923).
// booking_url = plain Booking.com URL uit Directus accommodations.booking_url.
// sid = 'accommodation-{article-slug}' voor CJ-rapportage.
export const CJ_CONFIG = {
  publisherId: '101734849',
  evergreenLinkId: '15734897',
} as const;

export function buildCjBookingLink(plainBookingUrl: string, sid: string): string {
  const encoded = encodeURIComponent(plainBookingUrl);
  return `https://www.kqzyfj.com/click-${CJ_CONFIG.publisherId}-${CJ_CONFIG.evergreenLinkId}?url=${encoded}&sid=${sid}`;
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
