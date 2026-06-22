// LAT-1664 — Valuta voor accommodatie-prijzen. Wijnregio's zijn standaard EUR;
// niet-eurozone landen (bv. Zuid-Afrika) dragen hun eigen valuta zodat de
// prijs-badge de booking.com-bron volgt i.p.v. Rand-bedragen met een euroteken
// te tonen. Centraal zodat elke render-pad (roundup + streek-kaart) gelijk loopt.

const LAND_CURRENCY: Record<string, string> = {
  'zuid-afrika': 'ZAR',
};

/** Valutacode voor een land-slug, bv. 'zuid-afrika' → 'ZAR'. Leeg = euro. */
export function currencyForLand(landSlug: string | null | undefined): string {
  return LAND_CURRENCY[(landSlug || '').toLowerCase()] || '';
}

/** Toon-symbool voor een valutacode. Leeg/onbekend = euro (back-compat). */
export function currencySymbol(code: string | null | undefined): string {
  switch ((code || '').toUpperCase()) {
    case 'ZAR': case 'R': return 'R ';
    case 'GBP': case '£': return '£';
    case 'USD': case '$': return '$';
    default: return '€';
  }
}
