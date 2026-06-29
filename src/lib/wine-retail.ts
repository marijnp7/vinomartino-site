// LAT-1593 — Wijnretail-affiliate (inline link op wijnhuis-POI's).
//
// Plan sectie 3 + affiliates.ts (Etna/Benanti-notitie): naast de "stay near"-
// boekingsbalk willen we op een wijnhuis-portret een inline link naar een
// wijnretailer waar je de besproken wijnen kunt kopen. Dat is commercieel het
// dichtst bij de intentie van een lezer die net een portret las.
//
// GOVERNANCE: er is nog GEEN wijnretail-affiliate-programma gecontracteerd.
// We verzinnen hier dus geen partner-ID of -URL (dat zou non-compliant zijn en
// niets opleveren). Dit blijft config-gated: zodra het bestuur/Marketing een
// programma kiest (bv. een NL/EU-wijnretailer met affiliate-netwerk), vul je
// WINE_RETAIL_PARTNER in en gaat de inline link vanzelf live. Tot die tijd
// rendert er niets (nooit een "coming soon" — Martin-stem, plan 4b).
//
// CTA-copy is een COPY-GATE: definitieve tekst via Lead Editor + Martin-check.

export interface WineRetailPartner {
  /** Partner-naam, bv. 'Grandcrux' of 'Wijnvoordeel'. */
  naam: string;
  /** Affiliate-zoek-URL-basis; {q} wordt vervangen door de zoekterm. */
  searchTemplate: string;
  /** Partner-id voor de cookieless click-tracker. */
  trackerPartner: string;
}

// Vul dit in zodra er een gecontracteerd programma is. null = geen inline link.
export const WINE_RETAIL_PARTNER: WineRetailPartner | null = null;

export interface WineRetailLink {
  href: string;
  partner: string;
  label: string;
}

/**
 * Bouw een inline wijnretail-affiliate-link voor een producent/wijnhuis.
 * Retourneert null wanneer er (nog) geen programma is geconfigureerd, zodat de
 * aanroeper de slot simpelweg niet rendert.
 */
export function wineRetailLink(producent: string): WineRetailLink | null {
  const partner = WINE_RETAIL_PARTNER;
  if (!partner || !producent.trim()) return null;
  const href = partner.searchTemplate.replace('{q}', encodeURIComponent(producent.trim()));
  return {
    href,
    partner: partner.trackerPartner,
    // COPY-GATE: definitieve CTA via Lead Editor + Martin-check.
    label: `Koop wijnen van ${producent.trim()} bij ${partner.naam}`,
  };
}
