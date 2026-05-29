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
  // === M1 ENTRIES — Lead Editor signoff 2026-05-29 (LAT-1028 comment eea04a89) ===
  // ACTIVATION GATE: Content Writer (LAT-1029-cw) moet bezoekdocumentatie bevestigen
  // per producent voordat deze entries uit comment gaan. Geen affiliate-blok zonder
  // bevestigd bezoek-bewijs (Lead Editor regel #2 van /over-ons).

  // Toscane — DEADLINE 2026-06-08
  // BLOCKED: geen Toscane-artikel in src/content/posts/. Lead Editor stelde slug
  // 'toscane-wijnreis-castello' voor; artikel bestaat niet. Optie A: Content Writer
  // schrijft het artikel. Optie B: alternatief Toscane-onderwerp + matching producent.
  // Geflagd bij Lead Editor + CEO.

  // Etna — DEADLINE 2026-06-15 — wacht op CW bezoek-doc signoff
  // 'etna-wijnreis-drie-dagen-vulkaan': [
  //   {
  //     location: 'activity',
  //     producent: 'Benanti',
  //     bezoekMaand: 'September',
  //     bezoekJaar: 2025,
  //     linkBron: 'directe link',
  //     href: 'https://www.cantinebenanti.it',
  //     ctaLabel: 'Plan je bezoek',
  //   },
  // ],

  // Langhe — DEADLINE 2026-06-15 — wacht op CW bezoek-doc signoff
  // Lead Editor noemde slug 'langhe-barolo-barbaresco'; bestaande slug =
  // 'langhe-piemonte-4-dagen-route'. Onderstaande key matched de échte slug.
  // 'langhe-piemonte-4-dagen-route': [
  //   {
  //     location: 'activity',
  //     producent: 'Cascina delle Rose',
  //     bezoekMaand: 'November',
  //     bezoekJaar: 2024,
  //     linkBron: 'directe link',
  //     href: 'https://www.cascinadellerose.it',
  //     ctaLabel: 'Bezoek wijnhuis',
  //   },
  // ],
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
