// Besluit 2026-10-05: de reisverhalen van Marijn (Directus `reispakketten`) hebben
// geen eigen pagina meer onder /reizen-nareizen/. Ze staan als blok "Zo reisden wij
// hem" op de wijnroute van dezelfde streek. Dit is het anker van dat blok; de hub
// (/wijnroutes/) en de 301's in nginx-prod.conf linken erheen.
import type { ReisPakket } from './reispakketten';

export const VERHAAL_ANCHOR = 'zo-reisden-wij';

/** Verhalen die bij een route horen: zelfde streek. */
export function verhalenVoorRoute(
  pakketten: readonly ReisPakket[],
  route: { streekSlug?: string | null },
): ReisPakket[] {
  if (!route.streekSlug) return [];
  return pakketten.filter((p) => p.streekSlug === route.streekSlug);
}
