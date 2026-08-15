// LAT-2575: i18n-fundament. NL is de primaire, prefixloze taal; EN leeft onder /en/.
// Dit fundament is schema-onafhankelijk: het levert alleen locale-helpers, geen Directus-data.
// De loader-koppeling (EN-records) en ui_strings volgen zodra het Directus-schema (LAT-2574) live is.

export type Locale = 'nl' | 'en';

export const LOCALES: readonly Locale[] = ['nl', 'en'] as const;

export const DEFAULT_LOCALE: Locale = 'nl';

// hreflang-waarden per locale. x-default wijst naar de NL-basisversie.
export const HREFLANG: Record<Locale, string> = { nl: 'nl', en: 'en' };

// <html lang>-waarden.
export const HTML_LANG: Record<Locale, string> = { nl: 'nl', en: 'en' };

// Open Graph og:locale-waarden.
export const OG_LOCALE: Record<Locale, string> = { nl: 'nl_NL', en: 'en_US' };

const EN_PREFIX = '/en';

export function isLocale(value: unknown): value is Locale {
  return value === 'nl' || value === 'en';
}

// Leid de locale af uit een pad. Alles onder /en/ is Engels; de rest is NL.
export function localeFromPath(pathname: string): Locale {
  return pathname === EN_PREFIX || pathname.startsWith(`${EN_PREFIX}/`) ? 'en' : 'nl';
}

// Verwijder het /en-voorvoegsel zodat het "kale" NL-pad overblijft (met leidende slash).
export function stripLocale(pathname: string): string {
  if (pathname === EN_PREFIX) return '/';
  if (pathname.startsWith(`${EN_PREFIX}/`)) return pathname.slice(EN_PREFIX.length);
  return pathname;
}

// Voeg het juiste voorvoegsel toe voor een gegeven locale. NL blijft prefixloos.
export function localizePath(pathname: string, locale: Locale): string {
  const bare = stripLocale(pathname);
  if (locale === DEFAULT_LOCALE) return bare;
  if (bare === '/') return `${EN_PREFIX}/`;
  return `${EN_PREFIX}${bare}`;
}

// LAT-2704 — route-families die (nog) GEEN /en/-tegenhanger hebben in src/pages/en/.
// Links hiernaartoe blijven bewust op het kale NL-pad staan: liever een expliciete
// taalwissel dan een harde 404. Zodra hier een EN-route bijkomt, haal je 'm hier weg
// en wordt de link automatisch locale-aware (één plek, geen sweep).
// LAT-3209 — /seizoenskalender/ staat hier ook in: de NL-lead-magnet-landingspagina
// krijgt bewust geen EN-tegenhanger zolang de PDF geblokkeerd is (LAT-2684/LAT-2318),
// en zonder deze regel zou de i18n-coverage-gate hem als vertaalgat rapporteren.
const EN_MISSING_PREFIXES: readonly string[] = [
    '/reizen-nareizen/',
    '/intern/',
    '/preview/',
    '/seizoenskalender/',
];

// LAT-2826 — uitzonderingen ÓP `EN_MISSING_PREFIXES`, op exacte padmatch. De
// listingpagina /reizen-nareizen/ heeft wél een /en/-tegenhanger (die altijd
// gebouwd wordt), terwijl de detailpagina's eronder pas een EN-versie krijgen
// zodra `reispakketten_translations` gevuld is. Zonder deze allowlist zou een
// EN-body-link naar het overzicht op het NL-pad blijven hangen; mét de allowlist
// blijven links naar losse (nog onvertaalde) pakketten wél NL — beter een
// expliciete taalwissel dan een 404.
const EN_PRESENT_EXACT_PATHS: readonly string[] = ['/reizen-nareizen/'];

// LAT-4918 — het spiegelbeeld van `EN_PRESENT_EXACT_PATHS`: LOSSE paden zonder
// EN-tegenhanger binnen een familie die verder wél vertaald wordt. Een prefix
// zou hier te grof zijn — `/artikelen/` als geheel krijgt juist wél een EN-versie,
// het gaat om dit ene stuk.
//
// `/artikelen/ik-weet-het-ik-drink-toch-wijn/` blijft bewust NL-only
// (redactionele beslissing Lead Editor, LAT-4917): het artikel hangt aan het
// Gezondheidsraad-advies van 25 juni 2026 en de behandeling daarvan in de Tweede
// Kamer — Nederlandse beleidscontext zonder zinvol EN-equivalent.
//
// `/artikelen/de-stille-wijnkeuze/` blijft om dezelfde reden bewust NL-only
// (redactionele beslissing Lead Editor, LAT-6137): Martins persoonlijke
// overweging na hetzelfde Gezondheidsraad-advies, bewust stil en persoonlijk van
// register — geen vertaalstuk en geen advies dat internationaal overdraagbaar is.
//
// Twee effecten, allebei bewust: EN-links hiernaartoe blijven op het kale NL-pad
// staan (expliciete taalwissel i.p.v. een harde 404), en de i18n-nl-gate
// (LAT-4912) telt het pad niet meer als dekkingsgat. Komt er ooit tóch een
// EN-versie, haal het pad hier weg — één plek, geen sweep.
const EN_MISSING_EXACT_PATHS: readonly string[] = [
    '/artikelen/ik-weet-het-ik-drink-toch-wijn/',
    '/artikelen/de-stille-wijnkeuze/',
];

// Padvergelijking die zowel `/x/` als `/x` accepteert; sitemap-URLs dragen een
// trailing slash, href-attributen in de content lang niet altijd.
function matchesExact(pathname: string, candidates: readonly string[]): boolean {
  return candidates.some((p) => pathname === p || pathname === p.replace(/\/$/, ''));
}

/**
 * LAT-4918 — heeft dit NL-pad bewust GEEN /en/-tegenhanger?
 *
 * Rangorde: een exact NL-only pad wint van alles (het is de fijnmazigste regel),
 * daarna geldt de familie-regel behalve waar `EN_PRESENT_EXACT_PATHS` hem opheft.
 */
export function isEnMissingPath(pathname: string): boolean {
  if (matchesExact(pathname, EN_MISSING_EXACT_PATHS)) return true;
  if (matchesExact(pathname, EN_PRESENT_EXACT_PATHS)) return false;
  return EN_MISSING_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );
}

/**
 * LAT-2704 — locale-aware href voor INTERNE links.
 *
 * Verschil met `localizePath`: deze variant is defensief en bedoeld voor href-attributen
 * in componenten die zowel de NL- als de /en/-boom renderen.
 *
 * - NL (`DEFAULT_LOCALE`) blijft byte-identiek: het kale pad komt onveranderd terug.
 * - Externe URLs, mailto/tel, hash- en query-only links en asset-paden blijven ongemoeid.
 * - Paden zonder EN-tegenhanger (`isEnMissingPath`: hele families via
 *   `EN_MISSING_PREFIXES`, losse paden via `EN_MISSING_EXACT_PATHS`) blijven NL.
 * - Al gelokaliseerde paden (`/en/...`) worden niet dubbel geprefixt.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return href;
  if (!href) return href;

  // LAT-2918: herschrijf absolute URLs naar vinomartino.com naar relatieve paden,
  // zodat ze als interne links kunnen worden gelokaliseerd.
  const absoluteToVino = /^https?:\/\/(?:www\.)?vinomartino\.com(\/[^?#]*)?((?:[?#].*)?)$/i.exec(href);
  if (absoluteToVino) {
    href = (absoluteToVino[1] || '/') + absoluteToVino[2];
  }

  if (!href.startsWith('/')) return href; // extern, hash, query, relatief
  if (href.startsWith('//')) return href; // protocol-relatief extern
  const [pathname] = href.split(/(?=[?#])/, 1);
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return href; // asset (.svg, .png, .json, .xml, ...)
  if (isEnMissingPath(pathname)) return href;
  const suffix = href.slice(pathname.length);
  return `${localizePath(pathname, locale)}${suffix}`;
}
