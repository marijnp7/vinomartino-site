// LAT-2575: i18n-fundament. NL is de primaire, prefixloze taal; EN leeft onder /en/.
// Dit fundament is schema-onafhankelijk: het levert alleen locale-helpers, geen Directus-data.
// De loader-koppeling (EN-records) en ui_strings volgen zodra het Directus-schema (LAT-2574) live is.

// LAT-14799 — generiek taalregister. Eén plek waar elke taal die de site ooit
// kan dragen beschreven staat (voorvoegsel, hreflang, html lang, og:locale,
// datumnotatie). Een taal in het register is NIET automatisch live: alleen wat
// in `ENABLED_LOCALES` staat krijgt routes, hreflang en een plek in de
// taalkiezer. Vertalingen voor DE/FR/ES/IT kunnen dus al in Directus staan
// zonder dat er een pagina verschijnt.

export const LOCALE_REGISTRY = {
  nl: { prefix: '', hreflang: 'nl', htmlLang: 'nl', ogLocale: 'nl_NL', dateLocale: 'nl-NL', collation: 'nl' },
  en: { prefix: '/en', hreflang: 'en', htmlLang: 'en', ogLocale: 'en_US', dateLocale: 'en-GB', collation: 'en' },
  de: { prefix: '/de', hreflang: 'de', htmlLang: 'de', ogLocale: 'de_DE', dateLocale: 'de-DE', collation: 'de' },
  fr: { prefix: '/fr', hreflang: 'fr', htmlLang: 'fr', ogLocale: 'fr_FR', dateLocale: 'fr-FR', collation: 'fr' },
  es: { prefix: '/es', hreflang: 'es', htmlLang: 'es', ogLocale: 'es_ES', dateLocale: 'es-ES', collation: 'es' },
  it: { prefix: '/it', hreflang: 'it', htmlLang: 'it', ogLocale: 'it_IT', dateLocale: 'it-IT', collation: 'it' },
} as const;

export type KnownLocale = keyof typeof LOCALE_REGISTRY;

// De configuratielijst die bepaalt wat live staat. Volgorde = volgorde in de
// taalkiezer. Een taal aanzetten = hier toevoegen (plus de bouwstappen uit het
// epic: routes, interfaceteksten, affiliate per taal).
export const ENABLED_LOCALES = ['nl', 'en'] as const satisfies readonly KnownLocale[];

export type EnabledLocale = (typeof ENABLED_LOCALES)[number];


// LAT-14799: de taalgegevens hieronder komen uit het register hierboven.
// `Locale` blijft de set talen die live staat; NL is prefixloos.
export type Locale = EnabledLocale;

export const LOCALES: readonly Locale[] = ENABLED_LOCALES;

export const DEFAULT_LOCALE: Locale = 'nl';

function perLocale<K extends 'hreflang' | 'htmlLang' | 'ogLocale' | 'dateLocale' | 'collation'>(key: K) {
  return Object.fromEntries(LOCALES.map((l) => [l, LOCALE_REGISTRY[l][key]])) as Record<Locale, string>;
}

// hreflang-waarden per locale. x-default wijst naar de NL-basisversie.
export const HREFLANG: Record<Locale, string> = perLocale('hreflang');

// <html lang>-waarden.
export const HTML_LANG: Record<Locale, string> = perLocale('htmlLang');

// Open Graph og:locale-waarden.
export const OG_LOCALE: Record<Locale, string> = perLocale('ogLocale');

// Datumnotatie (Intl) per locale.
export const DATE_LOCALE: Record<Locale, string> = perLocale('dateLocale');

// Sorteervolgorde (localeCompare) per locale.
export const COLLATION: Record<Locale, string> = perLocale('collation');

// Talen met een voorvoegsel (alles behalve NL), langste eerst.
const PREFIXED: readonly { locale: Locale; prefix: string }[] = LOCALES
  .filter((l) => l !== DEFAULT_LOCALE)
  .map((l) => ({ locale: l, prefix: LOCALE_REGISTRY[l].prefix as string }))
  .sort((a, b) => b.prefix.length - a.prefix.length);

function prefixMatch(pathname: string) {
  return PREFIXED.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

// Leid de locale af uit een pad. Een pad onder een taalvoorvoegsel is die taal; de rest is NL.
export function localeFromPath(pathname: string): Locale {
  return prefixMatch(pathname)?.locale ?? DEFAULT_LOCALE;
}

// Verwijder het taalvoorvoegsel zodat het "kale" NL-pad overblijft (met leidende slash).
export function stripLocale(pathname: string): string {
  const m = prefixMatch(pathname);
  if (!m) return pathname;
  if (pathname === m.prefix) return '/';
  return pathname.slice(m.prefix.length);
}

// LAT-14810: alleen het taalvoorvoegsel ('' voor NL, '/en' voor EN), voor
// plekken die een pad uit losse stukken opbouwen.
export function localePrefix(locale: Locale): string {
  return LOCALE_REGISTRY[locale].prefix;
}

// Voeg het juiste voorvoegsel toe voor een gegeven locale. NL blijft prefixloos.
export function localizePath(pathname: string, locale: Locale): string {
  const bare = stripLocale(pathname);
  if (locale === DEFAULT_LOCALE) return bare;
  const prefix = LOCALE_REGISTRY[locale].prefix;
  if (bare === '/') return `${prefix}/`;
  return `${prefix}${bare}`;
}

// LAT-2704 — route-families die (nog) GEEN /en/-tegenhanger hebben in src/pages/en/.
// Links hiernaartoe blijven bewust op het kale NL-pad staan: liever een expliciete
// taalwissel dan een harde 404. Zodra hier een EN-route bijkomt, haal je 'm hier weg
// en wordt de link automatisch locale-aware (één plek, geen sweep).
// LAT-3209 — /seizoenskalender/ staat hier ook in: de NL-lead-magnet-landingspagina
// krijgt bewust geen EN-tegenhanger zolang de PDF geblokkeerd is (LAT-2684/LAT-2318),
// en zonder deze regel zou de i18n-coverage-gate hem als vertaalgat rapporteren.
const EN_MISSING_PREFIXES: readonly string[] = [
    '/intern/',
    '/preview/',
    '/seizoenskalender/',
];

// LAT-2826 — uitzonderingen ÓP `EN_MISSING_PREFIXES`, op exacte padmatch: paden
// die wél een /en/-tegenhanger hebben binnen een familie die verder NL-only is.
// Sinds 2026-10-05 leeg (/reizen-nareizen/ is opgegaan in /wijnroutes/), de
// hook blijft staan voor een volgende familie.
const EN_PRESENT_EXACT_PATHS: readonly string[] = [];

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
//
// `/artikelen/overnachten-langhe-barolo-agriturismi/` (LAT-12192): de EN-variant
// is in LAT-11952 samengevoegd en 301't (nginx-prod.conf) naar de EN-keeper
// `waar-slapen-langhe-piemonte`; de NL-pagina blijft bewust bestaan. Er is dus
// geen EN-tegenhanger meer, en dat is geen vertaalgat. Zonder deze regel meldde
// de i18n-nl-gate dit pad elke dag als "NL zonder EN".
const EN_MISSING_EXACT_PATHS: readonly string[] = [
    '/artikelen/ik-weet-het-ik-drink-toch-wijn/',
    '/artikelen/de-stille-wijnkeuze/',
    '/artikelen/overnachten-langhe-barolo-agriturismi/',
    // LAT-14520: bewust NL-only, experiment 3b (B-test, publiek Nederlandse en Belgische
    // autovakantiegangers), redactiebesluit Lead Editor LAT-12569. Artikel 175 heeft geen EN-rij.
    '/artikelen/camping-vakantiehuis-bourgogne-wijnstop/',
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
  // The retired EN article has a live English keeper. Avoid a language switch.
  if (pathname.replace(/\/$/, '') === '/artikelen/overnachten-langhe-barolo-agriturismi') {
    return `/en/artikelen/waar-slapen-langhe-piemonte/${href.slice(pathname.length)}`;
  }
  if (isEnMissingPath(pathname)) return href;
  const suffix = href.slice(pathname.length);
  return `${localizePath(pathname, locale)}${suffix}`;
}

// LAT-14810: veld in de taal van de pagina, met terugval op het NL-veld.
// Vertaalde varianten heten `<veld><Taal>` (bioEn, taglineEn, ...); NL is het
// kale veld. Een nieuwe taal volgt hetzelfde patroon (bioDe) zonder extra tak.
export function localizedField<T extends object, K extends keyof T & string>(obj: T, key: K, locale: Locale): T[K] {
  if (locale === DEFAULT_LOCALE) return obj[key];
  const variant = (obj as Record<string, unknown>)[`${key}${locale.charAt(0).toUpperCase()}${locale.slice(1)}`] as T[K] | null | undefined;
  return variant ?? obj[key];
}
