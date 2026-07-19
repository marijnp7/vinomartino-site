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
