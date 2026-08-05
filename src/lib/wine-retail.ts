// LAT-1593 — Wijnretail-affiliate (inline link op wijnhuis-POI's).
//
// Plan sectie 3 + affiliates.ts (Etna/Benanti-notitie): naast de "stay near"-
// boekingsbalk willen we op een wijnhuis-portret een inline link naar een
// wijnretailer waar je de besproken wijnen kunt kopen. Dat is commercieel het
// dichtst bij de intentie van een lezer die net een portret las.
//
// LAT-3493 — de config komt uit Directus, niet uit een hardcoded const.
// Tot deze wijziging stond hier `WINE_RETAIL_PARTNER = null`, alleen te vullen
// met een code-deploy. Marijn wil dat Marketing dit zelf kan invullen zodra er
// een partner-ID binnen is (Grapedistrict/Daisycon staat nog dicht voor nieuwe
// publishers, LAT-1780). De singleton `wine_retail_partner` in Directus is nu de
// bron; de wiring hieronder leest hem per build.
//
// GOVERNANCE ONGEWIJZIGD: dit blijft config-gated. Zolang de singleton leeg of
// uitgezet is, retourneert wineRetailLink() null en rendert de aanroeper niets —
// nooit een "coming soon" (Martin-stem, plan 4b). We verzinnen geen partner-ID.
//
// CTA-copy is een COPY-GATE: definitieve tekst via Lead Editor + Martin-check.

import { readDirectusEnv, fetchDirectusCollection } from './directus-config';

export interface WineRetailPartner {
  /** Partner-naam, bv. 'Grandcrux' of 'Wijnvoordeel'. */
  naam: string;
  /** Affiliate-zoek-URL-basis; {q} wordt vervangen door de zoekterm. */
  searchTemplate: string;
  /** Partner-id voor de cookieless click-tracker. */
  trackerPartner: string;
}

/** Directus-singleton die deze config draagt (zie directus/scripts/create-wine-retail-partner-singleton.mjs). */
export const WINE_RETAIL_COLLECTION = 'wine_retail_partner';

/** Rijvorm zoals Directus hem teruggeeft (snake_case, alles nullable). */
interface WineRetailRow {
  actief?: unknown;
  naam?: unknown;
  search_template?: unknown;
  tracker_partner?: unknown;
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Vertaal een Directus-rij naar een bruikbare partnerconfig.
 *
 * Retourneert null zodra de config incompleet is: dat is de gate. Alle drie de
 * velden moeten gevuld zijn, `actief` moet aan staan en de template moet de
 * {q}-placeholder dragen — anders zouden we een halve of kapotte affiliate-URL
 * publiceren, en dat is erger dan geen link.
 */
export function partnerFromRow(row: WineRetailRow | null | undefined): WineRetailPartner | null {
  if (!row || row.actief !== true) return null;
  const naam = trimmedString(row.naam);
  const searchTemplate = trimmedString(row.search_template);
  const trackerPartner = trimmedString(row.tracker_partner);
  if (!naam || !searchTemplate || !trackerPartner) return null;
  if (!searchTemplate.includes('{q}')) {
    console.warn(
      `[wine-retail] ${WINE_RETAIL_COLLECTION}.search_template mist de {q}-placeholder — link overgeslagen (LAT-3493).`,
    );
    return null;
  }
  return { naam, searchTemplate, trackerPartner };
}

// Eén fetch per build: dit wordt op elk wijnhuis-portret aangeroepen en de config
// verandert niet halverwege een build. De promise zelf wordt gecachet zodat
// parallelle aanroepen niet alsnog N requests afvuren.
let partnerPromise: Promise<WineRetailPartner | null> | null = null;

/** Alleen voor tests/scripts: gooi de build-cache weg. */
export function resetWineRetailPartnerCache(): void {
  partnerPromise = null;
}

async function fetchPartner(): Promise<WineRetailPartner | null> {
  const env = readDirectusEnv();
  // Zonder Directus geen affiliate-link. Bewust géén throw: dit is een
  // commerciële slot, geen pagina-inhoud, dus het mag nooit een build breken
  // (anders dan de content-loaders, die fail-loud zijn per LAT-1078/1768).
  if (!env.configured) return null;

  const url = `${env.url}/items/${WINE_RETAIL_COLLECTION}?fields=actief,naam,search_template,tracker_partner`;
  let res: Response;
  try {
    res = await fetchDirectusCollection('wineRetailPartner', url, {
      headers: { Authorization: `Bearer ${env.token}` },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[wine-retail] Directus onbereikbaar: ${msg} — geen affiliate-link gerenderd.`);
    return null;
  }
  if (!res.ok) {
    // 403/404 = de singleton is nog niet gemigreerd of het build-token mist de
    // read-permissie. Beide betekenen "nog geen config", niet "build stuk".
    console.warn(
      `[wine-retail] Directus ${res.status} op ${WINE_RETAIL_COLLECTION} — geen affiliate-link gerenderd (LAT-3493).`,
    );
    return null;
  }

  const json = (await res.json().catch(() => null)) as { data?: WineRetailRow } | null;
  return partnerFromRow(json?.data);
}

/**
 * Lees de wijnretail-partnerconfig uit Directus (gecachet voor de hele build).
 * null = niet geconfigureerd of uitgezet → de aanroeper rendert niets.
 */
export function loadWineRetailPartner(): Promise<WineRetailPartner | null> {
  if (!partnerPromise) partnerPromise = fetchPartner();
  return partnerPromise;
}

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
export async function wineRetailLink(producent: string): Promise<WineRetailLink | null> {
  if (!producent.trim()) return null;
  const partner = await loadWineRetailPartner();
  if (!partner) return null;
  const href = partner.searchTemplate.replace('{q}', encodeURIComponent(producent.trim()));
  return {
    href,
    partner: partner.trackerPartner,
    // COPY-GATE: definitieve CTA via Lead Editor + Martin-check.
    label: `Koop wijnen van ${producent.trim()} bij ${partner.naam}`,
  };
}
