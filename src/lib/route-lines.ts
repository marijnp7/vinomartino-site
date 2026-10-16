// LAT-13816 — "Routes als atlas", fase 1. Pure helpers voor de dagkleuren, de
// vooraf berekende wegroute (src/data/route-lines/<slug>.json, gemaakt door
// scripts/build-route-lines.mjs) en de fallback zonder route-JSON of zonder `dag`.
// Geen Astro/Vite-imports hier: de node-test laadt dit bestand rechtstreeks.
import type { RouteStopGeo } from './routes';

/** Dag 1 geel, dag 2 roze, dag 3 mint; daarna wisselen ze af en draagt het nummer het verschil. */
export const DAG_KLEUREN = ['#F2C14E', '#E8A0BF', '#9FD3C7'] as const;
export const DAG_RAND = '#14100E';

export function dagKleur(dag: number): string {
    const i = Number.isInteger(dag) && dag > 0 ? (dag - 1) % DAG_KLEUREN.length : 0;
    return DAG_KLEUREN[i];
}

export interface RouteLineDay {
    dag: number;
    meters: number;
    seconds: number;
    /** [lat, lng], vereenvoudigd (Douglas-Peucker, 5 m). */
    coords: [number, number][];
}

export interface RouteLine {
    slug: string;
    source: string;
    generatedAt: string;
    totalMeters: number;
    days: RouteLineDay[];
    /** SVG-pad (viewBox 0 0 160 110) voor de routeschets op de hub. */
    sketch?: string;
}

/**
 * "± 85 km": standaard afgerond op 5 km (datastrip), nooit onder de stap, altijd met ±.
 * De legenda per dag gebruikt stap 1. null bij ontbrekende meting: we verzinnen geen km.
 */
export function formatKm(meters: number | null | undefined, step = 5): string | null {
    if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
    const km = Math.max(step, Math.round(meters / (1000 * step)) * step);
    return `± ${km} km`;
}

export function hasDagen(stops: RouteStopGeo[]): boolean {
    return stops.some((s) => Number.isInteger(s.dag) && (s.dag as number) > 0);
}

/** Doorlopende nummering van de route-waypoints (kind 'stop' of leeg); POI's krijgen null. */
export function stopNummers(stops: RouteStopGeo[]): (number | null)[] {
    let n = 0;
    return stops.map((s) => ((s.kind ?? 'stop') === 'stop' ? ++n : null));
}

export interface MapSegment {
    /** null = route zonder dagindeling (huidige rechte lijn, merkkleur). */
    dag: number | null;
    kleur: string | null;
    coords: [number, number][];
    /** true = gemeten wegroute, false = rechte lijn tussen de stops. */
    road: boolean;
    meters: number | null;
}

/**
 * Bepaalt wat de kaart tekent.
 * - Geen `dag` op de stops: één rechte lijn door de waypoints (gedrag vóór LAT-13816),
 *   ook als er een route-JSON ligt; zonder dagindeling is er geen dag om op te kleuren.
 * - Wel `dag`: per dag een segment in de dagkleur. Wegroute uit de JSON als die er
 *   is voor die dag, anders een rechte lijn door de stops van die dag (meters null).
 */
export function planRouteMap(stops: RouteStopGeo[], line: RouteLine | null): MapSegment[] {
    const geo = stops.filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lng));
    if (!hasDagen(geo)) {
        const wp = geo.filter((s) => (s.kind ?? 'stop') === 'stop');
        const pts = (wp.length >= 2 ? wp : geo).map((s) => [s.lat, s.lng] as [number, number]);
        return pts.length >= 2 ? [{ dag: null, kleur: null, coords: pts, road: false, meters: null }] : [];
    }
    const dagen = [...new Set(geo.map((s) => s.dag).filter((d): d is number => Number.isInteger(d) && (d as number) > 0))]
        .sort((a, b) => a - b);
    const out: MapSegment[] = [];
    let vorigeSlaap: RouteStopGeo | null = null;
    for (const dag of dagen) {
        const vanDag = geo.filter((s) => s.dag === dag);
        const lineDay = line?.days.find((d) => d.dag === dag && d.coords.length >= 2);
        if (lineDay) {
            out.push({ dag, kleur: dagKleur(dag), coords: lineDay.coords, road: true, meters: lineDay.meters });
        } else {
            const pts = [...(vorigeSlaap ? [vorigeSlaap] : []), ...vanDag].map((s) => [s.lat, s.lng] as [number, number]);
            if (pts.length >= 2) out.push({ dag, kleur: dagKleur(dag), coords: pts, road: false, meters: null });
        }
        const slaap = [...vanDag].reverse().find((s) => s.kind === 'slaap');
        if (slaap) vorigeSlaap = slaap;
    }
    return out;
}

/** Totaal in meters alleen als élke dag gemeten is; anders null (we verzinnen geen km). */
export function totaalMeters(segments: MapSegment[]): number | null {
    if (!segments.length || segments.some((s) => s.dag == null || s.meters == null)) return null;
    return segments.reduce((sum, s) => sum + (s.meters as number), 0);
}
