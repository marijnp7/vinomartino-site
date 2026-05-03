const SITE_URL = 'https://vinomartino.com';
const SITE_NAME = 'VinoMartino';

// ─── Organisation (use on homepage) ──────────────────────────────────────────

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    sameAs: [],
    description: 'Wijn- en reisplatform voor wijnliefhebbers: ontdek wijnhuizen, routes en streken.',
    inLanguage: 'nl',
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
  const isExternalUrl = data.website && data.website.startsWith('http');
  return {
    '@context': 'https://schema.org',
    '@type': 'Winery',
    name: data.name,
    description: data.description,
    url: isExternalUrl ? data.website : data.pageUrl,
    sameAs: isExternalUrl ? [data.website] : undefined,
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
          name: `${data.name} — stops`,
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

export function wijnhuisMetaTitle(name: string, region?: string): string {
  return region
    ? `${name} — Wijnhuis in ${region} | VinoMartino`
    : `${name} — Wijnhuis | VinoMartino`;
}

export function wijnhuisMetaDescription(data: {
  name: string;
  region?: string;
  country?: string;
  description?: string;
}): string {
  if (data.description) return data.description.slice(0, 155);
  const location = [data.region, data.country].filter(Boolean).join(', ');
  return `Ontdek ${data.name}${location ? ` in ${location}` : ''} — wijnen, druivenrassen en productiestijl. Alles over dit wijnhuis op VinoMartino.`;
}

export function wijnrouteMetaTitle(name: string, region?: string): string {
  return region
    ? `${name} — Wijnroute door ${region} | VinoMartino`
    : `${name} — Wijnroute | VinoMartino`;
}

export function wijnrouteMetaDescription(data: {
  name: string;
  region?: string;
  duration?: string;
  description?: string;
}): string {
  if (data.description) return data.description.slice(0, 155);
  const parts: string[] = [`Volg de ${data.name}`];
  if (data.region) parts.push(`door ${data.region}`);
  if (data.duration) parts.push(`(${data.duration})`);
  parts.push('— de mooiste wijnroute met tips voor wijnhuizen en proeverijen op VinoMartino.');
  return parts.join(' ');
}

export function streekMetaTitle(name: string, country?: string): string {
  return country
    ? `${name} — Wijnstreek in ${country} | VinoMartino`
    : `${name} — Wijnstreek | VinoMartino`;
}

export function streekMetaDescription(data: {
  name: string;
  country?: string;
  grapeVarieties?: string[];
  description?: string;
}): string {
  if (data.description) return data.description.slice(0, 155);
  const grapes =
    data.grapeVarieties && data.grapeVarieties.length > 0
      ? ` met ${data.grapeVarieties.slice(0, 3).join(', ')}`
      : '';
  const inCountry = data.country ? ` in ${data.country}` : '';
  return `Alles over de wijnstreek ${data.name}${inCountry}${grapes} — klimaat, terroir, wijnhuizen en wijntips van VinoMartino.`;
}

// ─── Land (Country / TouristDestination) ─────────────────────────────────────

export interface LandSchemaData {
  name: string;
  description?: string;
  image?: string | null;
  continent?: string;
  capital?: string;
  wijnstreken?: string[];
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
          hasPart: data.wijnstreken.map((streek) => ({
            '@type': 'Place',
            additionalType: 'https://schema.org/TouristDestination',
            name: streek,
          })),
        }
      : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.pageUrl },
    inLanguage: 'nl',
  };
}

export function landMetaTitle(name: string, continent?: string): string {
  return continent
    ? `${name} — Wijnen & wijnstreken in ${continent} | VinoMartino`
    : `${name} — Wijnen & wijnstreken | VinoMartino`;
}

export function landMetaDescription(data: {
  name: string;
  wijnstreken?: string[];
  grapeVarieties?: string[];
  description?: string;
}): string {
  if (data.description) return data.description.slice(0, 155);
  const streken =
    data.wijnstreken && data.wijnstreken.length > 0
      ? ` — streken als ${data.wijnstreken.slice(0, 3).join(', ')}`
      : '';
  const grapes =
    data.grapeVarieties && data.grapeVarieties.length > 0
      ? `, druivenrassen als ${data.grapeVarieties.slice(0, 3).join(', ')}`
      : '';
  return `Ontdek de wijnen van ${data.name}${streken}${grapes}. Wijnhuizen, routes en reistips van VinoMartino.`;
}
