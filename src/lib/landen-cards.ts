import type { Land } from './landen';
import type { Streek } from './streken';
import type { Wijnhuis } from './wijnhuizen';
import type { WijnRoute } from './routes';

// LAT-1199: card shapes consumed by LandPageContent. These live in a module
// (not the .astro frontmatter) because Astro hoists getStaticPaths into an
// isolated scope that only retains imports, not frontmatter helpers.
export type StreekCard = { name: string; slug: string; badge: string; description: string; image?: string };
export type WijnhuisCard = { name: string; slug: string; region: string; badge?: string };
export type RouteCard = { title: string; slug: string; days?: number; transport?: string; style?: string; stops?: string[] };

export function truncate(str: string, max = 150): string {
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// LAT-1199: derive the streken that belong to a land. Authoritative path is the
// streek→land M2O (`streek.landSlug`). Fall back to the land's `wijnstreken` O2M
// slugs when the FK is not yet populated (pre-LAT-1198 dump/migration).
export function strekenForLand(entry: Land, allStreken: Streek[]): Streek[] {
  const byLandFk = allStreken.filter(s => s.landSlug && s.landSlug === entry.slug);
  if (byLandFk.length > 0) return byLandFk;
  const relSlugs = new Set((entry.wijnstreken ?? []).map(w => w.slug).filter(Boolean) as string[]);
  if (relSlugs.size > 0) return allStreken.filter(s => relSlugs.has(s.slug));
  return [];
}

export function streekToCard(s: Streek): StreekCard {
  const badge = s.mainGrapes[0] || s.appellations[0] || s.country || '';
  return {
    name: s.name,
    slug: s.slug,
    badge,
    description: truncate(s.description || ''),
    image: s.heroImage || undefined,
  };
}

export function wijnhuisToCard(w: Wijnhuis): WijnhuisCard {
  return {
    name: w.name,
    slug: w.slug,
    region: w.region,
    badge: w.grapes[0] || undefined,
  };
}

export function routeToCard(r: WijnRoute): RouteCard {
  const m = (r.duration || '').match(/\d+/);
  return {
    title: r.title,
    slug: r.slug,
    days: m ? Number(m[0]) : undefined,
    transport: r.transport || undefined,
    style: r.style || undefined,
    stops: r.stops && r.stops.length >= 2 ? r.stops : undefined,
  };
}
