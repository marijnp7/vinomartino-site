import { type Locale, DEFAULT_LOCALE } from './i18n';
import { INSTAGRAM_URL, SUBSTACK_URL } from './social';

const SITE_URL = 'https://vinomartino.com';
const SITE_NAME = 'VinoMartino';

// Officiele kanalen van het merk. Geen enkele caller gaf `sameAs` ooit mee, dus
// stond het overal leeg; nu is dit de default zodat Google Instagram en
// Substack aan het merk koppelt. Callers kunnen nog steeds overriden.
const DEFAULT_SAME_AS = [INSTAGRAM_URL, SUBSTACK_URL].filter(Boolean);

// ─── Organisation (use on homepage) ──────────────────────────────────────────

export function organizationSchema(sameAs: string[] = DEFAULT_SAME_AS) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    founder: { '@type': 'Person', name: 'Marijn' },
    sameAs,
    description: 'Wijn- en reisplatform voor wijnliefhebbers: ontdek wijnhuizen, routes en streken.',
    inLanguage: 'nl',
  };
}

// ─── FAQPage ──────────────────────────────────────────────────────────────────
// Emit ONLY when the matching Q&A is also visible on the page (Google's
// structured-data policy). Callers gate on data presence so the schema stays in
// lockstep with the rendered FAQ copy.

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqPageSchema(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'nl',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

// ─── BreadcrumbList ───────────────────────────────────────────────────────────

export function breadcrumbSchema(crumbs: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.url.startsWith('http') ? crumb.url : `${SITE_URL}${crumb.url}`,
    })),
  };
}

// ─── Article (improved over inline version in [slug].astro) ──────────────────

export interface ArticleSchemaData {
  title: string;
  description?: string;
  author: string;
  datePublished: string;
  dateModified?: string;
  image?: string | null;
  url: string;
}

export function articleSchema(data: ArticleSchemaData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.title,
    description: data.description,
    author: { '@type': 'Person', name: data.author },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    datePublished: data.datePublished,
    dateModified: data.dateModified ?? data.datePublished,
    image: data.image ?? undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.url },
    inLanguage: 'nl',
  };
}

// ─── Wijnhuis (Winery / LocalBusiness) ───────────────────────────────────────

export interface WijnhuisSchemaData {
  name: string;
  description?: string;
  website?: string;
  image?: string | null;
  address?: string;
  region?: string;
  country?: string;
  grapes?: string[];
  established?: number;
  pageUrl: string;
}

export function wijnhuisSchema(data: WijnhuisSchemaData) {
  // Directus records store bare domains (egon-mueller.de) without protocol;
  // prefix https:// so the winery site surfaces as canonical url + sameAs.
  const website = data.website
    ? (/^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`)
    : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Winery',
    name: data.name,
    description: data.description,
    url: website ?? data.pageUrl,
    sameAs: website ? [website] : undefined,
    image: data.image ?? undefined,
    ...(data.address
      ? { address: { '@type': 'PostalAddress', streetAddress: data.address } }
      : {}),
    ...(data.region
      ? { containedInPlace: { '@type': 'Place', name: data.region } }
      : {}),
    ...(data.country
      ? { addressCountry: data.country }
      : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.pageUrl },
    inLanguage: 'nl',
  };
}

// ─── Wijnroute (TouristTrip) ──────────────────────────────────────────────────

export interface WijnrouteSchemaData {
  name: string;
  description?: string;
  image?: string | null;
  duration?: string;
  region?: string;
  country?: string;
  stops?: string[];
  pageUrl: string;
}

export function wijnrouteSchema(data: WijnrouteSchemaData) {
  const itinerary =
    data.stops && data.stops.length > 0
      ? {
          '@type': 'ItemList',
          name: `${data.name}, stops`,
          itemListElement: data.stops.map((stop, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: stop,
          })),
        }
      : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: data.name,
    description: data.description,
    image: data.image ?? undefined,
    touristType: [
      { '@type': 'Audience', audienceType: 'Wine enthusiasts' },
    ],
    availableLanguage: { '@type': 'Language', name: 'Dutch' },
    url: data.pageUrl,
    ...(itinerary ? { itinerary } : {}),
    ...(data.region
      ? { locationCreated: { '@type': 'Place', name: data.region } }
      : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.pageUrl },
    inLanguage: 'nl',
  };
}

// ─── Streek (Place / TouristDestination) ─────────────────────────────────────

export interface StreekSchemaData {
  name: string;
  description?: string;
  image?: string | null;
  country?: string;
  subregions?: string[];
  grapeVarieties?: string[];
  pageUrl: string;
}

export function streekSchema(data: StreekSchemaData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    additionalType: 'https://schema.org/TouristDestination',
    name: data.name,
    description: data.description,
    image: data.image ?? undefined,
    url: data.pageUrl,
    ...(data.country
      ? { containedInPlace: { '@type': 'Country', name: data.country } }
      : {}),
    ...(data.subregions && data.subregions.length > 0
      ? {
          hasPart: data.subregions.map((sub) => ({
            '@type': 'Place',
            name: sub,
          })),
        }
      : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.pageUrl },
    inLanguage: 'nl',
  };
}

// ─── Meta description templates ───────────────────────────────────────────────

export function wijnhuisMetaTitle(name: string, region?: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === 'en') {
    return region
      ? `${name}, Winery in ${region} | VinoMartino`
      : `${name}, Winery | VinoMartino`;
  }
  return region
    ? `${name}, Wijnhuis in ${region} | VinoMartino`
    : `${name}, Wijnhuis | VinoMartino`;
}

export function wijnhuisMetaDescription(data: {
  name: string;
  region?: string;
  country?: string;
  description?: string;
}, locale: Locale = DEFAULT_LOCALE): string {
  if (data.description) return data.description.slice(0, 155);
  const location = [data.region, data.country].filter(Boolean).join(', ');
  if (locale === 'en') {
    return `Discover ${data.name}${location ? ` in ${location}` : ''}, wines, grape varieties and production style. All about this winery on VinoMartino.`;
  }
  return `Ontdek ${data.name}${location ? ` in ${location}` : ''}, wijnen, druivenrassen en productiestijl. Alles over dit wijnhuis op VinoMartino.`;
}

export function wijnrouteMetaTitle(name: string, region?: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === 'en') {
    return region
      ? `${name}, Wine route through ${region} | VinoMartino`
      : `${name}, Wine route | VinoMartino`;
  }
  return region
    ? `${name}, Wijnroute door ${region} | VinoMartino`
    : `${name}, Wijnroute | VinoMartino`;
}

export function wijnrouteMetaDescription(data: {
  name: string;
  region?: string;
  duration?: string;
  description?: string;
}, locale: Locale = DEFAULT_LOCALE): string {
  if (data.description) return data.description.slice(0, 155);
  if (locale === 'en') {
    const parts: string[] = [`Follow the ${data.name}`];
    if (data.region) parts.push(`through ${data.region}`);
    if (data.duration) parts.push(`(${data.duration})`);
    parts.push('— the finest wine route with tips for wineries and tastings on VinoMartino.');
    return parts.join(' ');
  }
  const parts: string[] = [`Volg de ${data.name}`];
  if (data.region) parts.push(`door ${data.region}`);
  if (data.duration) parts.push(`(${data.duration})`);
  parts.push('— de mooiste wijnroute met tips voor wijnhuizen en proeverijen op VinoMartino.');
  return parts.join(' ');
}

export function streekMetaTitle(name: string, country?: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === 'en') {
    return country
      ? `${name}, Wine region in ${country} | VinoMartino`
      : `${name}, Wine region | VinoMartino`;
  }
  return country
    ? `${name}, Wijnstreek in ${country} | VinoMartino`
    : `${name}, Wijnstreek | VinoMartino`;
}

export function streekMetaDescription(data: {
  name: string;
  country?: string;
  grapeVarieties?: string[];
  description?: string;
}, locale: Locale = DEFAULT_LOCALE): string {
  if (data.description) return data.description.slice(0, 155);
  const inCountry = data.country ? ` in ${data.country}` : '';
  if (locale === 'en') {
    const grapes =
      data.grapeVarieties && data.grapeVarieties.length > 0
        ? ` with ${data.grapeVarieties.slice(0, 3).join(', ')}`
        : '';
    return `Everything about the ${data.name} wine region${inCountry}${grapes}, climate, terroir, wineries and wine tips from VinoMartino.`;
  }
  const grapes =
    data.grapeVarieties && data.grapeVarieties.length > 0
      ? ` met ${data.grapeVarieties.slice(0, 3).join(', ')}`
      : '';
  return `Alles over de wijnstreek ${data.name}${inCountry}${grapes}, klimaat, terroir, wijnhuizen en wijntips van VinoMartino.`;
}

// ─── Land (Country / TouristDestination) ─────────────────────────────────────

export interface LandSchemaData {
  name: string;
  description?: string;
  image?: string | null;
  continent?: string;
  capital?: string;
  /**
   * Accepts plain names (legacy showcase-derived) or `{name, slug}` objects
   * (Directus o2m join, post-LAT-1008). Slugs yield resolvable `url` in JSON-LD.
   */
  wijnstreken?: Array<string | { name: string; slug?: string }>;
  grapeVarieties?: string[];
  pageUrl: string;
}

export function landSchema(data: LandSchemaData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Country',
    additionalType: 'https://schema.org/TouristDestination',
    name: data.name,
    description: data.description,
    image: data.image ?? undefined,
    url: data.pageUrl,
    ...(data.continent
      ? { containedInPlace: { '@type': 'Place', name: data.continent } }
      : {}),
    ...(data.capital
      ? { containsPlace: [{ '@type': 'City', name: data.capital }] }
      : {}),
    ...(data.wijnstreken && data.wijnstreken.length > 0
      ? {
          hasPart: data.wijnstreken.map((streek) => {
            const name = typeof streek === 'string' ? streek : streek.name;
            const slug = typeof streek === 'string' ? undefined : streek.slug;
            const url = slug ? `${SITE_URL}/streken/${slug}/` : undefined;
            return {
              '@type': 'Place',
              additionalType: 'https://schema.org/TouristDestination',
              name,
              ...(url ? { url } : {}),
            };
          }),
        }
      : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.pageUrl },
    inLanguage: 'nl',
  };
}

const CONTINENT_EN: Record<string, string> = {
  Europa: 'Europe',
  Afrika: 'Africa',
  'Noord-Amerika': 'North America',
  'Zuid-Amerika': 'South America',
  Azië: 'Asia',
  Oceanië: 'Oceania',
};

export function landMetaTitle(name: string, continent?: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === 'en') {
    const continentEn = continent ? (CONTINENT_EN[continent] ?? continent) : undefined;
    return continentEn
      ? `${name}, Wines & wine regions in ${continentEn} | VinoMartino`
      : `${name}, Wines & wine regions | VinoMartino`;
  }
  return continent
    ? `${name}, Wijnen & wijnstreken in ${continent} | VinoMartino`
    : `${name}, Wijnen & wijnstreken | VinoMartino`;
}

export function landMetaDescription(data: {
  name: string;
  wijnstreken?: Array<string | { name: string; slug?: string }>;
  grapeVarieties?: string[];
  description?: string;
}, locale: Locale = DEFAULT_LOCALE): string {
  if (data.description) return data.description.slice(0, 155);
  const strekenNames =
    data.wijnstreken
      ?.map((s) => (typeof s === 'string' ? s : s.name))
      .filter((n): n is string => Boolean(n)) ?? [];
  if (locale === 'en') {
    const streken =
      strekenNames.length > 0 ? `, regions like ${strekenNames.slice(0, 3).join(', ')}` : '';
    const grapes =
      data.grapeVarieties && data.grapeVarieties.length > 0
        ? `, grape varieties like ${data.grapeVarieties.slice(0, 3).join(', ')}`
        : '';
    return `Discover the wines of ${data.name}${streken}${grapes}. Wineries, routes and travel tips from VinoMartino.`;
  }
  const streken =
    strekenNames.length > 0 ? `, streken als ${strekenNames.slice(0, 3).join(', ')}` : '';
  const grapes =
    data.grapeVarieties && data.grapeVarieties.length > 0
      ? `, druivenrassen als ${data.grapeVarieties.slice(0, 3).join(', ')}`
      : '';
  return `Ontdek de wijnen van ${data.name}${streken}${grapes}. Wijnhuizen, routes en reistips van VinoMartino.`;
}
