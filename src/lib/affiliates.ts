// LAT-1029 — Affiliate block config per article (M1-Optie B).
// Lead Editor (LAT-1028) drops verified producer entries here as they're cleared.
// One entry per (slug, location). Empty location → no block rendered at that slot.

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

export const AFFILIATE_BLOCKS: Record<string, AffiliateBlockConfig[]> = {
  // Toscane — first working affiliate, deadline 2026-06-08
  // TODO(LAT-1028 Lead Editor): vul producent + href in zodra Booking-AID en producent-keuze
  // bevestigd zijn. Tot dan blijft het artikel zonder affiliate-blok in productie.
  // 'toscane-wijnreis-castello': [...]

  // Etna — deadline 2026-06-15
  // 'etna-wijnreis-drie-dagen-vulkaan': [...]

  // Langhe — deadline 2026-06-15
  // 'langhe-barolo-barbaresco': [...]
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
