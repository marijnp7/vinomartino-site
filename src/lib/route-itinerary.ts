// LAT-2013 [VIS-STRAT-02] — route-itinerary als productlaag.
//
// `routes.itinerary` (Directus JSON) is de gestructureerde bron van waarheid voor
// een route: dagen met genummerde stops (kind wijnhuis|eten|bezienswaardigheid|
// overnachting), gestructureerde rijtijden (integer minuten, besluit #3) en een
// boekbare overnachting per nacht. Vervangt op termijn het regexen van dag-blokken
// uit proza (route-days.ts) en het dubbel onderhouden van stops_geo.
//
// Tolerant geparsed à la parseStopsGeo: half-gevulde of afwezige velden mogen de
// build nooit breken. Ontbreekt `itinerary` (nog null op alle routes), dan geeft
// parseItinerary null terug en valt de route-pagina terug op de proza-fallback —
// nul regressie, graceful degrade.

import type { RouteStopGeo, RouteStopKind } from './routes';
import { normalizeEmDashes } from './markdown';

// Gesloten waardenlijst (Marijn-besluit #2). `overnachting` als stop-kind bestaat
// naast het aparte `overnachting`-object per dag (voor nachten die geen genummerde
// stop op de as zijn).
export type ItineraryStopKind = 'wijnhuis' | 'eten' | 'bezienswaardigheid' | 'overnachting';

export interface ItineraryStop {
    kind: ItineraryStopKind;
    naam: string;
    slug: string | null;
    lat: number | null;
    lng: number | null;
    /** Eén cursieve waarom-regel (PoiCard whyRegel). */
    why: string | null;
    /** Bezoekduur, bv. "1,5 uur". Vrije tekst. */
    duur: string | null;
    /** DAM-fotoreferentie of pad. */
    foto: string | null;
}

export interface ItineraryOvernachting {
    naam: string;
    slug: string | null;
    lat: number | null;
    lng: number | null;
    foto: string | null;
    /** Boekbaar → CTA op het nacht-blok. */
    boekbaar: boolean;
}

export interface ItineraryDay {
    n: number;
    title: string;
    summary: string | null;
    /** Rijtijd in minuten (integer, besluit #3). null = onbekend. */
    rijtijdMin: number | null;
    stops: ItineraryStop[];
    overnachting: ItineraryOvernachting | null;
}

export interface RouteItinerary {
    days: ItineraryDay[];
}

function asString(val: unknown): string | null {
    if (val == null) return null;
    const s = String(val).trim();
    return s ? normalizeEmDashes(s) : null;
}

function asFiniteNumber(val: unknown): number | null {
    if (val == null || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

function normalizeStopKind(val: unknown): ItineraryStopKind {
    const raw = String(val ?? '').toLowerCase().trim();
    if (raw === 'wijnhuis' || raw === 'winery' || raw === 'kelder') return 'wijnhuis';
    if (raw === 'eten' || raw === 'restaurant' || raw === 'eet') return 'eten';
    if (raw === 'overnachting' || raw === 'slaap' || raw === 'hotel' || raw === 'accommodatie') return 'overnachting';
    return 'bezienswaardigheid';
}

function parseStop(row: unknown): ItineraryStop | null {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const naam = asString(rec.naam ?? rec.name);
    const slug = asString(rec.slug);
    // Een stop zonder naam én zonder slug is niet renderbaar.
    if (!naam && !slug) return null;
    return {
        kind: normalizeStopKind(rec.kind ?? rec.type),
        naam: naam ?? (slug as string),
        slug,
        lat: asFiniteNumber(rec.lat),
        lng: asFiniteNumber(rec.lng),
        why: asString(rec.why ?? rec.why_regel ?? rec.whyRegel),
        duur: asString(rec.duur ?? rec.duration),
        foto: asString(rec.foto ?? rec.image ?? rec.dam_image_ref),
    };
}

function parseOvernachting(row: unknown): ItineraryOvernachting | null {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const naam = asString(rec.naam ?? rec.name);
    const slug = asString(rec.slug);
    if (!naam && !slug) return null;
    return {
        naam: naam ?? (slug as string),
        slug,
        lat: asFiniteNumber(rec.lat),
        lng: asFiniteNumber(rec.lng),
        foto: asString(rec.foto ?? rec.image ?? rec.dam_image_ref),
        boekbaar: rec.boekbaar === true || rec.boekbaar === 'true' || rec.bookable === true,
    };
}

function parseDay(row: unknown, index: number): ItineraryDay | null {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const stopsRaw = Array.isArray(rec.stops) ? rec.stops : [];
    const stops = stopsRaw.map(parseStop).filter((s): s is ItineraryStop => s !== null);
    const overnachting = parseOvernachting(rec.overnachting);
    // Een dag zonder stops én zonder overnachting draagt geen productwaarde.
    if (stops.length === 0 && !overnachting) return null;
    const n = asFiniteNumber(rec.n) ?? index + 1;
    return {
        n: Math.trunc(n),
        title: asString(rec.title ?? rec.etappe) ?? `Dag ${Math.trunc(n)}`,
        summary: asString(rec.summary ?? rec.intro),
        rijtijdMin: (() => {
            const r = asFiniteNumber(rec.rijtijd_min ?? rec.rijtijdMin);
            return r != null ? Math.trunc(r) : null;
        })(),
        stops,
        overnachting,
    };
}

// Tolerant parser voor routes.itinerary. Accepteert zowel een echte JSON-waarde als
// een JSON-string. Geeft null terug wanneer er geen enkele bruikbare dag is, zodat
// de consument (route-pagina) stil terugvalt op de proza/regex-fallback.
export function parseItinerary(val: unknown): RouteItinerary | null {
    let root: unknown = val;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return null;
        try { root = JSON.parse(trimmed); } catch { return null; }
    }
    if (!root || typeof root !== 'object') return null;
    const daysRaw = Array.isArray((root as Record<string, unknown>).days)
        ? (root as Record<string, unknown>).days as unknown[]
        : Array.isArray(root) ? root as unknown[] : [];
    const days = daysRaw
        .map((d, i) => parseDay(d, i))
        .filter((d): d is ItineraryDay => d !== null);
    if (days.length === 0) return null;
    return { days };
}

const STOP_KIND_TO_GEO: Record<ItineraryStopKind, RouteStopKind> = {
    wijnhuis: 'wijnhuis',
    overnachting: 'slaap',
    eten: 'stop',
    bezienswaardigheid: 'stop',
};

// Leidt stops_geo af uit de itinerary (besluit: stops_geo niet dubbel onderhouden).
// Alleen stops/overnachtingen mét geldige lat+lng worden een kaartpin. `kind` en
// `slug` reizen mee zodat de merkgekleurde routelaag (LAT-2000) en wijnhuis-
// deeplinks (LAT-2010) blijven werken. Volgorde = dag-volgorde, dan stop-volgorde.
export function deriveStopsGeoFromItinerary(itinerary: RouteItinerary): RouteStopGeo[] {
    const out: RouteStopGeo[] = [];
    for (const day of itinerary.days) {
        for (const stop of day.stops) {
            if (stop.lat == null || stop.lng == null) continue;
            const geo: RouteStopGeo = {
                naam: stop.naam,
                lat: stop.lat,
                lng: stop.lng,
                kind: STOP_KIND_TO_GEO[stop.kind],
            };
            if (stop.slug) geo.slug = stop.slug;
            out.push(geo);
        }
        const ov = day.overnachting;
        if (ov && ov.lat != null && ov.lng != null) {
            const geo: RouteStopGeo = { naam: ov.naam, lat: ov.lat, lng: ov.lng, kind: 'slaap' };
            if (ov.slug) geo.slug = ov.slug;
            out.push(geo);
        }
    }
    return out;
}
