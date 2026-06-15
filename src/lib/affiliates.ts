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
  // Production article `wijnreizen-toscane-voorbij-de-toeristische-chianti-route`
  // beschrijft het bezoek: "drie weken van tevoren gemaild ... ontvangen door een
  // neef van de eigenaar ... cantina: grote fusti 2.000–5.000 L". Sluit precies
  // aan op CW-verificatie (LAT-1030 comment c367f942). Bezoek = Oktober 2024.
  // GetYourGuide partner-URL nog niet rond; tijdelijk directe link naar
  // capezzana.it/visita-e-degustazioni/ (Lead Editor original).
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

  // Langhe — Produttori del Barbaresco (Cascina delle Rose-vervanger per LAT-1030
  // comment 27226cc5). Production article `een-week-in-piemonte-barolo-barbaresco-
  // en-alles-daartussenin` is de Piemonte-pillar (Oktober 2024-trip): "In oktober
  // zijn die heuvelruggen geel en oranje", coöperatief-passage met €18 ex-cellar.
  // Disclosure-jaar = 2024 (matcht "2024-prijs" voor truffel in artikel-body).
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
  // op /streken/etna/ blijft (enoteca-tasting format) MET wijnwinkel-affiliate-link
  // (Vincourage/Grapedistrict voor Pietramarina Carricante). Dat is een aparte
  // deliverable op de Etna streekpagina — niet via deze artikel-affiliate-lookup.
  // Content Writer past LAT-884 Etna-draft aan. Geen affiliate-blok op
  // `etna-wijnreis-drie-dagen-vulkaan` voor M1.

  // === LAT-923 Booking.com CJ deeplinks — curated accommodations ===
  // CJ Publisher ID: 101734849 | Evergreen Link ID: 15734897
  // Advertiser: Booking.com BENELUX (4347407) | Regio: NL / EUR | Commissie: 4%
  // Template: https://www.kqzyfj.com/click-101734849-15734897?url={ENCODED}&sid={SID}
  // CJ-constraint (mail 12 jun): contextuele, redactionele links — geen push-marketing.
  // Eén placement = één route (niet dubbel linken met Stay22 op dezelfde accommodatie).

  // Toscane — Brolio Agriroom ✅ Marijn verbleef er mei 2024 (bevestigd, eerste
  // accommodation-item in Directus). Artikel: wijnreizen-toscane-voorbij-de-toeristische-chianti-route
  'wijnreizen-toscane-voorbij-de-toeristische-chianti-route': [
    {
      location: 'accommodation',
      producent: 'Brolio Agriroom (Castello di Brolio)',
      bezoekMaand: 'Mei',
      bezoekJaar: 2024,
      linkBron: 'Booking.com',
      href: 'https://www.kqzyfj.com/click-101734849-15734897?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Fbrolio-agriroom.html&sid=accommodation-brolio-agriroom',
      ctaLabel: 'Bekijk beschikbaarheid',
      description: 'Vier kamers boven het Eroica Caffè op het domein van Barone Ricasoli. Wij liepen er \'s ochtends door de wijngaarden naar de kasteelmuren.',
    },
  ],

  // Piemonte — Locanda del Pilone (La Morra) + Palazzo Finati (Alba) ✅
  // Artikel-narratief bevestigt beide verblijven (article id 6: "We overnachtten in
  // La Morra (Locanda del Pilone) ... verplaatsten daarna naar Alba zelf (Palazzo Finati)").
  // Jaar geschat op 2021 obv canonieke Piemonte-trip juli 2021 — Lead Editor mag corrigeren.
  // Locanda del Pilone = accommodation-blok (eerste helft trip, Langhe-context).
  // Palazzo Finati = sidebar-blok (tweede helft, Alba).
  'een-week-in-piemonte-barolo-barbaresco-en-alles-daartussenin': [
    {
      location: 'accommodation',
      producent: 'Locanda del Pilone',
      bezoekMaand: 'Juli',
      bezoekJaar: 2021,
      linkBron: 'Booking.com',
      href: 'https://www.kqzyfj.com/click-101734849-15734897?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Flocanda-del-pilone.html&sid=accommodation-locanda-pilone',
      ctaLabel: 'Bekijk beschikbaarheid',
      description: 'Modern boutique-hotel boven de Langhe bij La Morra, €140 per nacht. Panoramisch uitzicht over de wijngaarden.',
    },
    {
      location: 'sidebar',
      producent: 'Palazzo Finati',
      bezoekMaand: 'Juli',
      bezoekJaar: 2021,
      linkBron: 'Booking.com',
      href: 'https://www.kqzyfj.com/click-101734849-15734897?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Fpalazzo-finati-alba2.html&sid=accommodation-palazzo-finati',
      ctaLabel: 'Bekijk beschikbaarheid',
      description: 'Historisch palazzo in het centrum van Alba, €135 per nacht. Beste vertrekpunt voor de restaurantavonden.',
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
