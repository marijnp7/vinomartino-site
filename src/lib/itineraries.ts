export interface Itinerary {
  slug: string;
  title: string;
  countrySlug: string;
  duration: string;
  budget: string;
  difficulty: string;
  description: string;
  heroImage: string;
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
}

const DIRECTUS_URL = process.env['DIRECTUS_URL'] || '';
const DIRECTUS_TOKEN = process.env['DIRECTUS_TOKEN'] || '';

function mapDirectusItinerary(d: Record<string, unknown>, html: string): Itinerary {
  return {
    slug: String(d.slug),
    title: String(d.title),
    countrySlug: String(d.country_slug || ''),
    duration: String(d.duration || ''),
    budget: String(d.budget || ''),
    difficulty: String(d.difficulty || ''),
    description: String(d.description || ''),
    heroImage: d.hero_image ? `${DIRECTUS_URL}/assets/${d.hero_image}` : '',
    bodyHtml: html,
    metaTitle: String(d.meta_title || d.title || ''),
    metaDescription: String(d.meta_description || ''),
  };
}

let _cached: Itinerary[] | null = null;

export async function loadItineraries(): Promise<Itinerary[]> {
  if (_cached) return _cached;

  if (DIRECTUS_URL && DIRECTUS_TOKEN) {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/itineraries?limit=-1&fields=*&sort=-date_created`,
        {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const { markdownToHtml } = await import('./markdown.js');
        const items = await Promise.all(
          (json.data || []).map(async (d: Record<string, unknown>) => {
            const html = d.body ? await markdownToHtml(String(d.body)) : '';
            return mapDirectusItinerary(d, html);
          }),
        );
        if (items.length > 0) {
          _cached = items;
          console.log(`[loadItineraries] fetched ${items.length} itineraries from Directus`);
          return _cached;
        }
      }
    } catch (err) {
      console.warn(`[loadItineraries] Directus fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  _cached = [];
  return _cached;
}

export function getItineraryBySlug(slug: string): Itinerary | undefined {
  return (_cached || []).find((i) => i.slug === slug);
}

export function getItinerariesByCountry(countrySlug: string): Itinerary[] {
  return (_cached || []).filter((i) => i.countrySlug === countrySlug);
}
