export interface Brand {
  slug: string;
  name: string;
  tagline: string;
  status: 'draft' | 'live' | 'archived';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  fontHeading: string;
  fontBody: string;
  logoPrimary?: string;
  logoMonochrome?: string;
  favicon?: string;
  ogDefaultImage?: string;
  socialInstagram?: string;
  socialPinterest?: string;
  socialYoutube?: string;
  socialTiktok?: string;
  contentPillars: string[];
  locales: string[];
  defaultLocale: string;
}

export const brands: Brand[] = [
  {
    slug: 'vinomartino',
    name: 'VinoMartino',
    tagline: 'Wijnreizen met karakter',
    status: 'live',
    primaryColor: '#5E1A1D',
    secondaryColor: '#E8DCC4',
    accentColor: '#6E7F5E',
    textColor: '#2A2622',
    fontHeading: '"Cormorant Garamond", "EB Garamond", "Georgia", serif',
    fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    socialInstagram: 'vinomartino',
    socialPinterest: 'vinomartino',
    contentPillars: [
      'Wijnregio-gidsen',
      'Wijnhuis-portretten',
      'Route & itineraire',
      'Druif & terroir',
      'Proeverij-ervaringen',
      'Culinaire combinaties',
      'Seizoenskalender',
      'Praktische reistips',
    ],
    locales: ['nl'],
    defaultLocale: 'nl',
  },
];

const DIRECTUS_URL = process.env['DIRECTUS_URL'] || '';
const DIRECTUS_TOKEN = process.env['DIRECTUS_TOKEN'] || '';

function mapDirectusBrand(d: Record<string, unknown>): Brand {
  return {
    slug: d.slug as string,
    name: d.name as string,
    tagline: (d.tagline as string) || '',
    status: d.status as Brand['status'],
    primaryColor: (d.primary_color as string) || '#000000',
    secondaryColor: (d.secondary_color as string) || '#FFFFFF',
    accentColor: (d.accent_color as string) || '#666666',
    textColor: (d.text_color as string) || '#1a1a1a',
    fontHeading: (d.font_heading as string) || 'Georgia, serif',
    fontBody: (d.font_body as string) || 'Inter, sans-serif',
    logoPrimary: d.logo_primary ? `${DIRECTUS_URL}/assets/${d.logo_primary}` : undefined,
    logoMonochrome: d.logo_monochrome ? `${DIRECTUS_URL}/assets/${d.logo_monochrome}` : undefined,
    favicon: d.favicon ? `${DIRECTUS_URL}/assets/${d.favicon}` : undefined,
    ogDefaultImage: d.og_default_image ? `${DIRECTUS_URL}/assets/${d.og_default_image}` : undefined,
    socialInstagram: d.social_instagram as string | undefined,
    socialPinterest: d.social_pinterest as string | undefined,
    socialYoutube: d.social_youtube as string | undefined,
    socialTiktok: d.social_tiktok as string | undefined,
    contentPillars: (d.content_pillars as string[]) || [],
    locales: (d.locales as string[]) || ['nl'],
    defaultLocale: (d.default_locale as string) || 'nl',
  };
}

async function fetchBrandsFromDirectus(): Promise<Brand[] | null> {
  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.warn(`[fetchBrands] skipped: ${!DIRECTUS_URL ? 'DIRECTUS_URL' : 'DIRECTUS_TOKEN'} is not set`);
    return null;
  }
  try {
    const res = await fetch(
      `${DIRECTUS_URL}/items/brands?filter[status][_neq]=archived&sort=name`,
      { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } },
    );
    if (!res.ok) {
      console.warn(`[fetchBrands] Directus responded ${res.status} ${res.statusText}`);
      return null;
    }
    const json = await res.json();
    return (json.data as Record<string, unknown>[]).map(mapDirectusBrand);
  } catch (err) {
    console.warn(`[fetchBrands] fetch failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

let _cachedBrands: Brand[] | null = null;

export async function loadBrands(): Promise<Brand[]> {
  if (_cachedBrands) return _cachedBrands;
  const remote = await fetchBrandsFromDirectus();
  _cachedBrands = remote && remote.length > 0 ? remote : brands;
  return _cachedBrands;
}

export function getBrandBySlug(slug: string): Brand | undefined {
  return (_cachedBrands || brands).find((b) => b.slug === slug);
}

export function getLiveBrands(): Brand[] {
  return (_cachedBrands || brands).filter((b) => b.status === 'live');
}

export function getAllBrandSlugs(): string[] {
  return (_cachedBrands || brands).map((b) => b.slug);
}

export function isSingleBrandMode(): boolean {
  return !!process.env.BRAND;
}

export function getActiveBrand(): Brand | undefined {
  const slug = process.env.BRAND;
  if (!slug) return undefined;
  return getLiveBrands().find((b) => b.slug === slug);
}
