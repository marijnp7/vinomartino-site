// LAT-1029 — Affiliate block config per article (M1-Optie B).
// Accommodatie-bookinglinks horen NIET in deze file (PROJECT_BRIEF par. 3.0).
// booking_url per accommodatie leeft in Directus accommodations.booking_url
// (plain Booking.com URL). CJ-wrapper wordt at render time toegepast via
// buildCjBookingLink(). Zie LAT-923 voor architectuur.
//
// Wat hier WEL staat: activity/directe-link-blokken (geen Booking.com-afhankelijkheid).

export type AffiliateLocation = 'accommodation' | 'activity' | 'sidebar';
export type AffiliateLinkBron = 'Booking.com' | 'GetYourGuide' | 'directe link';

export interface AffiliateBlockConfig {
  location: AffiliateLocation;
  producent: string;
  bezoekMaand: string;
  bezoekJaar: number;
  linkBron: AffiliateLinkBron;
  href: string;
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

export const AFFILIATE_BLOCKS: Record<string, AffiliateBlockConfig[]> = {
  // === M1 ENTRIES — activity/directe-link blokken ===
  // Activation governance: Content Writer ([LAT-1030](/LAT/issues/LAT-1030)) verifieert
  // bezoek-doc per producent; Lead Editor maakt finale call. Geen affiliate-blok zonder
  // bevestigd bezoek-bewijs (Lead Editor regel #2 van /over-ons).
  //
  // Booking.com-accommodaties: worden via Directus accommodations.booking_url + CJ-wrapper
  // gerenderd zodra LAT-1328 de 403 op accommodations-collectie oplost. Niet hier.

  // Langhe — Produttori del Barbaresco (Piemonte-pillar, Oktober 2024-trip)
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
  ],

  // Etna — Benanti ❌ Lead Editor: portret-link vervalt. Streekpagina-vermelding
  // op /streken/etna/ blijft (enoteca-tasting format) MET wijnwinkel-affiliate-link.
  // Dat is een aparte deliverable op de Etna streekpagina. Geen blok op
  // `etna-wijnreis-drie-dagen-vulkaan` voor M1.

  // Toscane — Tenuta di Capezzana (activity, ✅ Lead Editor go LAT-1030 comment 27226cc5)
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
