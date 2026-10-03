// LAT-12451 — pure helpers voor de redesign van /reizen-nareizen/ (geen Directus-calls).
// De meta-rij per routekaart wordt afgeleid uit bestaande velden; er is bewust geen
// "seizoen" en geen teaser-veld (Directus kent ze niet, en de mockup-waarden zijn
// niet geverifieerd, REGEL 31).
import type { WijnRoute } from './routes';

export type DagenBucket = '1-2' | '3-4' | '5+';

export function routeDagen(route: Pick<WijnRoute, 'duration' | 'itinerary'>): number | null {
  const m = /(\d+)/.exec(route.duration || '');
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0) return n;
  }
  const days = route.itinerary?.days?.length ?? 0;
  return days > 0 ? days : null;
}

export function dagenBucket(n: number | null): DagenBucket | null {
  if (n === null) return null;
  if (n <= 2) return '1-2';
  if (n <= 4) return '3-4';
  return '5+';
}

export function routeWijnhuizen(route: Pick<WijnRoute, 'itinerary' | 'stopsGeo'>): number | null {
  let n = 0;
  for (const day of route.itinerary?.days ?? []) {
    n += day.stops.filter((s) => s.kind === 'wijnhuis').length;
  }
  if (n === 0) n = route.stopsGeo.filter((s) => s.kind === 'wijnhuis').length;
  return n > 0 ? n : null;
}

// routes.streek_id is bij Alto Adige leeg, dus geen land via de streek-relatie.
const LAND_BY_ROUTE_PREFIX: Array<[string, string]> = [['alto-adige', 'Italië']];

export function routeLand(route: Pick<WijnRoute, 'slug' | 'streekSlug'>, landByStreek: Map<string, string>): string {
  const viaStreek = route.streekSlug ? landByStreek.get(route.streekSlug) : '';
  if (viaStreek) return viaStreek;
  return LAND_BY_ROUTE_PREFIX.find(([p]) => route.slug.startsWith(p))?.[1] ?? '';
}

// Verwachte vraag (Design Lead, niet gemeten): deze streken eerst binnen hun groep.
const PRIORITY = ['langhe', 'toscane', 'bourgogne'];

function priority(route: Pick<WijnRoute, 'slug'>): number {
  const i = PRIORITY.findIndex((p) => route.slug.startsWith(p));
  return i === -1 ? PRIORITY.length : i;
}

export function orderRoutes<T extends Pick<WijnRoute, 'slug' | 'title'>>(routes: T[]): T[] {
  return [...routes].sort((a, b) => priority(a) - priority(b) || a.title.localeCompare(b.title, 'nl'));
}
