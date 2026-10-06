// Besluit 2026-10-05: de reisverhalen van Marijn (Directus `reispakketten`) hebben
// geen eigen pagina meer onder /reizen-nareizen/. Ze staan als blok "Zo reisden wij
// hem" op de wijnroute van dezelfde streek. Dit is het anker van dat blok; de hub
// (/wijnroutes/) en de 301's in nginx-prod.conf linken erheen.
import type { ReisPakket } from './reispakketten';

export const VERHAAL_ANCHOR = 'zo-reisden-wij';

/**
 * Verhalen die bij een route horen. Een verhaal met `routeSlug` (Directus
 * `reispakketten.route_id`) hoort alleen bij díe route; een verhaal zonder
 * `routeSlug` valt terug op de streek (LAT-12646).
 */
export function verhalenVoorRoute(
  pakketten: readonly Pick<ReisPakket, 'slug' | 'streekSlug' | 'routeSlug'>[],
  route: { slug?: string | null; streekSlug?: string | null },
): ReisPakket[] {
  return pakketten.filter((p) => {
    if (p.routeSlug) return p.routeSlug === route.slug;
    return Boolean(route.streekSlug) && p.streekSlug === route.streekSlug;
  }) as ReisPakket[];
}

// LAT-12716 / LAT-12709: de Moezelroute draagt het reisverhaal zelf in `routes.body`.
// Daar staat het blok "Zo reisden wij hem" niet óók nog eens; de hub linkt dan naar de
// route zonder anker. Voeg een slug pas toe als de route-body het verhaal heeft overgenomen.
const ROUTES_MET_VERHAAL_IN_BODY: ReadonlySet<string> = new Set(['mosel-bernkastel-traben-trarbach']);

export const verhaalInRouteBody = (routeSlug: string | null | undefined): boolean =>
  Boolean(routeSlug) && ROUTES_MET_VERHAAL_IN_BODY.has(routeSlug as string);
