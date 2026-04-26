export const defaultLocale = 'nl' as const;
export const supportedLocales = ['nl'] as const;
export type Locale = (typeof supportedLocales)[number];

export interface LocaleConfig {
  code: string;
  name: string;
  nativeName: string;
  active: boolean;
}

export const localeConfigs: Record<string, LocaleConfig> = {
  nl: { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', active: true },
  en: { code: 'en', name: 'English', nativeName: 'English', active: false },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', active: false },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', active: false },
};

export function getActiveLocales(): LocaleConfig[] {
  return Object.values(localeConfigs).filter((l) => l.active);
}

export function isValidLocale(code: string): boolean {
  return code in localeConfigs && localeConfigs[code].active;
}

export function buildBrandPath(brandSlug: string, locale: string, path = ''): string {
  const base = `/${brandSlug}/${locale}`;
  return path ? `${base}/${path}/` : `${base}/`;
}
