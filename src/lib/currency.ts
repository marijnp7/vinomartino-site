// LAT-1664 — Currency-laag voor accommodatie-prijzen. Board-besluit (Marijn,
// 2026-06-22): álle prijzen worden site-breed in EUR getoond. Bronbedragen
// staan in de valuta van het land (booking.com levert Zuid-Afrika-prijzen in
// ZAR); we bewaren die native en converteren pas op render-tijd naar de
// display-valuta (default EUR). Zo kan later een valuta-switcher bovenin de
// pagina de display-valuta wisselen zónder data of render-laag te herschrijven:
// de conversie is één parameter (displayValuta), niet hardcoded per kaart.

/** Bron-valuta per land-slug, bv. 'zuid-afrika' → 'ZAR'. Onbekend/leeg = EUR. */
const LAND_CURRENCY: Record<string, string> = {
  'zuid-afrika': 'ZAR',
};

/** Bron-valutacode voor een land-slug. Wijnregio's zijn standaard EUR. */
export function currencyForLand(landSlug: string | null | undefined): string {
  return LAND_CURRENCY[(landSlug || '').toLowerCase()] || 'EUR';
}

// EUR-gebaseerde referentiekoersen: 1 EUR = N <valuta>. Eén centrale tabel zodat
// er geen magic numbers in de render-code staan en een koers-update één regel
// is. Handmatig vastgezet op de ECB-referentiekoers-orde van ~2026-06 (ZAR
// schommelt rond 20/EUR). Wordt dit ooit live: vervang de tabel door een
// build-time fetch — de publieke API (convertToEur/formatMoney) blijft gelijk.
const EUR_RATES: Record<string, number> = {
  EUR: 1,
  ZAR: 20.5,
};

/** Normaliseer losse symbolen/codes naar een ISO-code. Leeg/onbekend = EUR. */
function normalizeCode(code: string | null | undefined): string {
  const c = (code || '').trim().toUpperCase();
  switch (c) {
    case 'R': return 'ZAR';
    case '£': return 'GBP';
    case '$': return 'USD';
    default: return c || 'EUR';
  }
}

/** Toon-symbool voor een valutacode. Onbekend = euro. */
export function currencySymbol(code: string | null | undefined): string {
  switch (normalizeCode(code)) {
    case 'ZAR': return 'R ';
    case 'GBP': return '£';
    case 'USD': return '$';
    default: return '€';
  }
}

/** Reken een bedrag in `from` om naar EUR. Onbekende valuta → ongewijzigd. */
export function convertToEur(amount: number, from: string | null | undefined): number {
  const rate = EUR_RATES[normalizeCode(from)];
  return rate ? amount / rate : amount;
}

/**
 * Format een bron-bedrag in de display-valuta (default EUR). Converteert van de
 * bron-valuta naar EUR (en eventueel verder naar een andere display-valuta) en
 * rondt af op hele eenheden. Eurozone-bedragen blijven byte-identiek (koers 1,
 * hele getallen). Forward-compat: geef een andere `display` mee — bv. uit een
 * toekomstige valuta-switcher — en dezelfde functie rekent erheen.
 */
export function formatMoney(
  amount: number | null | undefined,
  source: string | null | undefined,
  display: string = 'EUR',
): string | null {
  if (amount == null) return null;
  const eur = convertToEur(amount, source);
  const target = normalizeCode(display);
  const value = target === 'EUR' ? eur : eur * (EUR_RATES[target] ?? 1);
  return `${currencySymbol(target)}${Math.round(value)}`;
}
