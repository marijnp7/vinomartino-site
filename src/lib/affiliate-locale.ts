// LAT-2576: affiliate-taallokalisatie. Provider-parameters browser-geverifieerd (2026-07-16):
//   - GetYourGuide: pad-prefix `/en-gb` schakelt de site naar Engels; partner_id/cmp/q blijven
//     ongewijzigd in de query (browser-bevestigd: titel + prijzen in het Engels, EUR).
//   - Booking.com: `lang=en-gb` op de doel-URL levert een volledig Engelse SERP (EUR-valuta,
//     exonym "Piedmont" i.p.v. "Piemonte"). Geldt voor zowel de CJ-directe deeplink als het
//     Awin `ued`-doel.
//   - Stay22 Allez `/roam`: de redirect naar de OTA (Booking) lokaliseert op bezoeker-geo /
//     Accept-Language; een `lang`-param wordt NIET doorgegeven. Best-effort dus (schadeloos):
//     echte EN-bezoekers krijgen vanzelf een Engelse OTA-pagina.
//   - Sunny Cars (TradeTracker, autohuur): de Engelse storefront leeft onder pad-prefix `/en`
//     (browser-geverifieerd 2026-07-18: sunnycars.nl/en → htmlLang=en, volledig Engelse UI +
//     "24/7 English-speaking customer service"). EN-pagina's krijgen dus de /en-storefront i.p.v.
//     een dode link — gracieus weglaten is niet nodig want EN-support bestaat.
// NL blijft byte-identiek: EN-parameters worden UITSLUITEND toegevoegd voor locale 'en'.
import type { Locale } from './i18n';

// GetYourGuide-pad-prefix vóór de query. Leeg voor NL (auto/geo), `/en-gb` voor EN.
export const GYG_LOCALE_PATH: Record<Locale, string> = { nl: '', en: '/en-gb' };

// Booking.com lang-waarde voor EN. NL krijgt géén lang-param (huidig gedrag = geo-detectie).
export const BOOKING_EN_LANG = 'en-gb';

// Stay22 Allez lang-waarde voor EN (best-effort; de roam-redirect kan hem negeren).
export const STAY22_EN_LANG = 'en';

/** Zet `lang=en-gb` op een booking.com-doel-URL voor EN; laat NL (en niet-parseerbaar) ongemoeid. */
export function applyBookingLocale(bookingUrl: string, locale: Locale): string {
  if (locale !== 'en') return bookingUrl;
  try {
    const u = new URL(bookingUrl);
    u.searchParams.set('lang', BOOKING_EN_LANG);
    return u.toString();
  } catch {
    return bookingUrl;
  }
}

// Sunny Cars-basisbestemming per locale. NL prefixloos (huidig gedrag), EN → `/en`-storefront.
export const SUNNYCARS_DEFAULT_DEST: Record<Locale, string> = {
  nl: 'https://www.sunnycars.nl/',
  en: 'https://www.sunnycars.nl/en/',
};

/**
 * Prefix een sunnycars-doel-URL met `/en` voor EN (idempotent). Laat NL, niet-parseerbare en
 * niet-sunnycars-URLs ongemoeid, zodat een expliciete Directus-bookingUrl niet corrumpeert.
 */
export function applySunnyCarsLocale(dest: string, locale: Locale): string {
  if (locale !== 'en') return dest;
  try {
    const u = new URL(dest);
    if (!/(^|\.)sunnycars\.[a-z.]+$/i.test(u.hostname)) return dest;
    if (u.pathname === '/en' || u.pathname.startsWith('/en/')) return dest;
    u.pathname = u.pathname === '/' ? '/en/' : `/en${u.pathname}`;
    return u.toString();
  } catch {
    return dest;
  }
}
