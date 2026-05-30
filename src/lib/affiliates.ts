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
  // === M1 ENTRIES ===
  // Activation governance: Content Writer ([LAT-1030](/LAT/issues/LAT-1030)) verifieert
  // bezoek-doc per producent; Lead Editor maakt finale call. Geen affiliate-blok zonder
  // bevestigd bezoek-bewijs (Lead Editor regel #2 van /over-ons).

  // Toscane — Tenuta di Capezzana ✅ Lead Editor go (LAT-1030 comment 27226cc5).
  // ON HOLD: geen Toscane-artikel in src/content/posts/ — CW heeft `LAT-36-toscane-draft.md`
  // klaar in editorial workspace (Bolgheri+Montalcino+Carmignano-structuur). Wacht op
  // Lead Editor eindredactie + publicatie van die draft, dan activeert CTO entry met
  // de uiteindelijke slug. Capezzana-bezoek = Oktober 2024 (CW bevestigd).

  // Langhe — Produttori del Barbaresco (vervanger voor Cascina delle Rose per
  // [LAT-1030](/LAT/issues/LAT-1030) comment 27226cc5). Volledig gedocumenteerd in
  // `langhe-piemonte-4-dagen-route.md`: Sophie's Rabajà-moment + zes flessen mee
  // genomen — Via Torino 54 Barbaresco. Trip = februari (artikel-narratief
  // "Piemonte in februari"). Jaar genoteerd als 2026 obv pub-date 2026-04-15;
  // Lead Editor mag corrigeren via comment-fix als nodig.
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

  // Etna — Benanti ❌ Lead Editor: portret-link vervalt. Streekpagina-vermelding
  // op /streken/etna/ blijft (enoteca-tasting format) MET wijnwinkel-affiliate-link
  // (Vincourage/Grapedistrict voor Pietramarina Carricante). Dat is een aparte
  // deliverable op de Etna streekpagina — niet via deze artikel-affiliate-lookup.
  // Content Writer past LAT-884 Etna-draft aan. Geen affiliate-blok op
  // `etna-wijnreis-drie-dagen-vulkaan` voor M1.
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
