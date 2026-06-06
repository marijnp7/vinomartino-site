// LAT-1127 — Stay22 "Allez" affiliate deep-links.
// The Let-Me-Allez loader (letmeallez.js) already lives in the global <head>
// (LAT-1126). On top of that auto-conversion we render explicit, crawl-verifiable
// Allez search links so every page has at least one clickable Stay22 unit.
//
// Allez SRP (search-results) deep-link format — accepts a plain place string,
// so it works for our content that has no lat/lng:
//   https://www.stay22.com/allez/roam?aid=<aid>&address=<place>&campaign=<label>
// Docs: https://community.stay22.com/allez-deep-links-everything-you-need-to-know

export const STAY22_AID = 'vinomartino';

// Brand burgundy (tokens.css --burgundy) for the Stay22 map marker/accent.
// Stay22 maincolor expects a bare hex (no leading #).
export const STAY22_MAINCOLOR = '5A1A1F';

const ALLEZ_BASE = 'https://www.stay22.com/allez/roam';
const EMBED_BASE = 'https://www.stay22.com/embed/gm';

export interface RegionCoords {
  lat: number;
  lng: number;
}

// LAT-1127 — curated coords for premium hero-regio's (Marijn-spec 2026-06-06),
// keyed by streek-slug. Used until an editor-set lat/lng Directus field exists
// (fast-follow, needs admin). Pages without a match fall back to the Allez
// place-string deep-link.
export const HERO_REGION_COORDS: Record<string, RegionCoords> = {
  'langhe-piemonte': { lat: 44.7009, lng: 8.0357 },
  'etna-sicilie': { lat: 37.8772, lng: 14.949 },
  'douro-portugal': { lat: 41.1909, lng: 7.5547 },
  'toscane': { lat: 43.0596, lng: 11.4894 },
  'champagne': { lat: 47.9956, lng: 4.3667 },
  'wachau': { lat: 48.3954, lng: 15.521 },
  'mosel-duitsland': { lat: 49.9167, lng: 7.0833 },
  'priorat': { lat: 41.1936, lng: 0.7361 },
};

export function heroCoordsForSlug(slug: string): RegionCoords | undefined {
  return HERO_REGION_COORDS[slug];
}

export interface EmbedMapOptions {
  lat: number;
  lng: number;
  campaign?: string;
  /** Bare hex (no #); defaults to brand burgundy. */
  maincolor?: string;
}

/** Build a Stay22 interactive map embed URL (for an iframe, min-height 450px). */
export function embedMapUrl({ lat, lng, campaign, maincolor = STAY22_MAINCOLOR }: EmbedMapOptions): string {
  const params = new URLSearchParams();
  params.set('aid', STAY22_AID);
  params.set('lat', String(lat));
  params.set('lng', String(lng));
  if (campaign) params.set('campaign', campaign);
  if (maincolor) params.set('maincolor', maincolor.replace(/^#/, ''));
  return `${EMBED_BASE}?${params.toString()}`;
}

export interface AllezLinkOptions {
  /** Destination as a place string: city, region, country or venue name. */
  location: string;
  /** Tracking label surfaced in the Stay22 Hub stats. */
  campaign?: string;
}

/** Build an Allez accommodation-search deep-link for a destination string. */
export function allezSearchUrl({ location, campaign }: AllezLinkOptions): string {
  const params = new URLSearchParams();
  params.set('aid', STAY22_AID);
  params.set('address', location);
  if (campaign) params.set('campaign', campaign);
  return `${ALLEZ_BASE}?${params.toString()}`;
}

interface RelatedLike {
  name?: string;
}

interface ArticleLocationSource {
  relatedStreken?: RelatedLike[];
  relatedWijnhuizen?: RelatedLike[];
  relatedLanden?: RelatedLike[];
  relatedWijnroutes?: RelatedLike[];
}

/**
 * Derive a Stay22 destination for an article from its CMS relations, so the
 * "Waar te slapen" block is content-driven rather than hardcoded in markdown.
 * Preference order favours the most specific accommodation anchor:
 * winery → region → route → country. Returns null when nothing geographic is linked.
 */
export function deriveArticleLocation(article: ArticleLocationSource): string | null {
  const candidates = [
    article.relatedWijnhuizen?.[0]?.name,
    article.relatedStreken?.[0]?.name,
    article.relatedWijnroutes?.[0]?.name,
    article.relatedLanden?.[0]?.name,
  ];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return null;
}
