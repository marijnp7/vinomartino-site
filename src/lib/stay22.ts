// LAT-1127 — Stay22 "Allez" affiliate deep-links.
// The Let-Me-Allez loader (letmeallez.js) already lives in the global <head>
// (LAT-1126). On top of that auto-conversion we render explicit, crawl-verifiable
// Allez search links so every page has at least one clickable Stay22 unit.
//
// Allez SRP (search-results) deep-link format — accepts a plain place string,
// so it works for our content that has no lat/lng:
//   https://www.stay22.com/allez/roam?aid=<aid>&address=<place>&campaign=<label>
// Docs: https://community.stay22.com/allez-deep-links-everything-you-need-to-know
//
// LAT-2576 — taal: de roam-redirect stuurt door naar de OTA (Booking) en lokaliseert
// dáár op bezoeker-geo/Accept-Language; een `lang`-param is browser-geverifieerd NIET
// afdwingbaar via roam (2026-07-16). We zetten `lang=en` op EN-pagina's als best-effort
// intentie (schadeloos) — echte EN-bezoekers krijgen sowieso een Engelse OTA-pagina.

import type { Locale } from './i18n';
import { STAY22_EN_LANG } from './affiliate-locale';

export const STAY22_AID = 'vinomartino';

const ALLEZ_BASE = 'https://www.stay22.com/allez/roam';

export interface AllezLinkOptions {
  /** Destination as a place string: city, region, country or venue name. */
  location: string;
  /** Tracking label surfaced in the Stay22 Hub stats. */
  campaign?: string;
  /** Language of the page the link sits on. Default NL (current behaviour). */
  locale?: Locale;
}

/** Build an Allez accommodation-search deep-link for a destination string. */
export function allezSearchUrl({ location, campaign, locale = 'nl' }: AllezLinkOptions): string {
  const params = new URLSearchParams();
  params.set('aid', STAY22_AID);
  params.set('address', location);
  if (campaign) params.set('campaign', campaign);
  if (locale === 'en') params.set('lang', STAY22_EN_LANG);
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
