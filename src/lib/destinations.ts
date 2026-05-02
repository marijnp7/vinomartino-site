export interface Destination {
  slug: string;
  name: string;
  countrySlug: string;
  regionSlug: string | null;
  description: string;
  heroImage: string;
  highlights: string[];
  metaTitle: string;
  metaDescription: string;
}

const DIRECTUS_URL = process.env['DIRECTUS_URL'] || '';
const DIRECTUS_TOKEN = process.env['DIRECTUS_TOKEN'] || '';

function mapDirectusDestination(d: Record<string, unknown>): Destination {
  return {
    slug: String(d.slug),
    name: String(d.name),
    countrySlug: String(d.country_slug || ''),
    regionSlug: d.region_slug ? String(d.region_slug) : null,
    description: String(d.description || ''),
    heroImage: d.hero_image ? `${DIRECTUS_URL}/assets/${d.hero_image}` : '',
    highlights: (d.highlights as string[]) || [],
    metaTitle: String(d.meta_title || d.name || ''),
    metaDescription: String(d.meta_description || ''),
  };
}

let _cached: Destination[] | null = null;

export async function loadDestinations(): Promise<Destination[]> {
  if (_cached) return _cached;

  if (DIRECTUS_URL && DIRECTUS_TOKEN) {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/destinations?limit=-1&sort=name`,
        {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const items = (json.data || []).map(mapDirectusDestination);
        if (items.length > 0) {
          _cached = items;
          console.log(`[loadDestinations] fetched ${items.length} destinations from Directus`);
          return _cached;
        }
      }
    } catch (err) {
      console.warn(`[loadDestinations] Directus fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  _cached = [];
  return _cached;
}

export function getDestinationBySlug(slug: string): Destination | undefined {
  return (_cached || []).find((d) => d.slug === slug);
}

export function getDestinationsByCountry(countrySlug: string): Destination[] {
  return (_cached || []).filter((d) => d.countrySlug === countrySlug);
}
