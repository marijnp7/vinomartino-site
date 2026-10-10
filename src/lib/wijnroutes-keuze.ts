// LAT-13075 — keuzehulp op /wijnroutes/ (goedgekeurd ontwerp 2026-10-10, paneel 02/03).
// Pure helpers zonder Directus-toegang: build-time kaartdata en de filterstatus in het
// URL-fragment. De client importeert dezelfde parse/serialize/matches, zodat server en
// browser dezelfde regels volgen. Zelfde aanpak als de wijnhuizen-keuzehulp
// (src/lib/wijnhuis-filter.ts): fragment i.p.v. query, dus deelbaar en niet indexeerbaar.
import type { RouteStopGeo, WijnRoute } from './routes';

export interface KeuzeState { q: string; land: string; duur: string }

export const LEGE_KEUZE: KeuzeState = { q: '', land: '', duur: '' };

/** `#q=…&land=…&duur=…` → status. Onbekende waarden worden door de caller gevalideerd. */
export function parseKeuzeHash(hash: string): KeuzeState {
    const p = new URLSearchParams((hash || '').replace(/^#/, ''));
    return { q: p.get('q') || '', land: p.get('land') || '', duur: p.get('duur') || '' };
}

/** Status → fragment zonder `#`; lege status = lege string. Vaste volgorde voor stabiele URLs. */
export function serializeKeuze(s: KeuzeState): string {
    const p = new URLSearchParams();
    if (s.q.trim()) p.set('q', s.q.trim());
    if (s.land) p.set('land', s.land);
    if (s.duur) p.set('duur', s.duur);
    return p.toString();
}

export interface KeuzeKaart { zoek: string; land: string; duur: string }

/** Matcht één routekaart (al gevouwen zoektekst) op de status; `qWords` zijn gevouwen woorden. */
export function matchesKeuze(c: KeuzeKaart, qWords: string[], s: Pick<KeuzeState, 'land' | 'duur'>): boolean {
    if (s.land && c.land !== s.land) return false;
    if (s.duur && c.duur !== s.duur) return false;
    return qWords.every((w) => c.zoek.includes(w));
}

/**
 * Korte kaarttitel: CMS-veld `short_title` als dat er is, anders de streeknaam uit het
 * CMS, anders de volledige titel. De lange redactionele titel blijft op de routepagina.
 */
export function kaartTitel(route: Pick<WijnRoute, 'shortTitle' | 'title'>, streekNaam?: string): string {
    return (route.shortTitle || '').trim() || (streekNaam || '').trim() || route.title;
}

/**
 * Kaartgeometrie uitsluitend uit bestaande routes.stopsGeo (CMS / itinerary / repo-
 * gazetteer); er wordt niets verzonnen. Minder dan twee geldige punten = niet op de kaart.
 */
export function kaartLijn(stops: RouteStopGeo[]): [number, number][] {
    const geo = stops.filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lng));
    const waypoints = geo.filter((s) => (s.kind ?? 'stop') === 'stop');
    const line = waypoints.length >= 2 ? waypoints : geo;
    return line.length >= 2 ? line.map((s) => [s.lat, s.lng] as [number, number]) : [];
}
