/**
 * Atlas-data loader (LAT-1122) — geïsoleerde Directus-queries voor de
 * interactieve landen-atlas. Bewust GESCHEIDEN van loadLanden/loadStreken zodat
 * een atlas-specifiek schema- of permissie-gat (LAT-1120-velden) de bestaande
 * landen-/streken-pagina's NIET kan breken: élke fout degradeert naar `null`
 * → de /landen/[slug]-pagina rendert gewoon zonder atlas (geen regressie).
 *
 * 404-veiligheid (harde eis): de zones komen uit dezelfde streken-query als de
 * /streken/-paginagenerator (zelfde statusfilter). `publishedSlugs` = precies de
 * geladen streek-slugs, dus een zone is alléén klikbaar als die streekpagina ook
 * echt gebouwd wordt. Appellaties drillen naar hun parent-streek.
 */
import {
    readDirectusEnv,
    statusFilterQuery,
    type DirectusEnv,
} from './directus-config';
import { mapConfigToProps, buildZones } from './atlas';
import { normalizeEmDashes } from './markdown';
import type {
    AtlasMapConfig,
    AtlasZone,
} from '../components/InfographicAtlasInteractive.astro';

export interface AtlasData {
    kicker?: string;
    facts: { label: string; value: string }[];
    map: AtlasMapConfig;
    zones: AtlasZone[];
}

type Rec = Record<string, unknown>;

async function getJson(url: string, token: string): Promise<unknown[] | null> {
    const headers = { Authorization: `Bearer ${token}` };
    let res: Response;
    try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadAtlas] Directus unreachable: ${msg}`);
        return null;
    }
    if (!res.ok) {
        // 400 = atlas-velden bestaan nog niet (pre-LAT-1120-migratie);
        // 403 = build-rol mist read-permissie; 404 = collectie weg. In alle
        // gevallen: geen atlas i.p.v. een harde build-fout.
        console.warn(`[loadAtlas] Directus ${res.status} on ${url} — atlas overgeslagen.`);
        return null;
    }
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object') return null;
    const data = (json as Rec).data;
    return Array.isArray(data) ? data : null;
}

function deriveFacts(
    land: Rec,
    streken: Rec[],
    appellaties: Rec[],
): { label: string; value: string }[] {
    const override = land.facts_override;
    if (Array.isArray(override)) {
        const out = override
            .map((f) => {
                if (!f || typeof f !== 'object') return null;
                const rec = f as Rec;
                const label = rec.label ? normalizeEmDashes(String(rec.label)) : '';
                const value = rec.value ? normalizeEmDashes(String(rec.value)) : '';
                return label && value ? { label, value } : null;
            })
            .filter((f): f is { label: string; value: string } => f !== null);
        if (out.length > 0) return out;
    }
    const facts: { label: string; value: string }[] = [];
    if (streken.length > 0) facts.push({ label: 'Wijnstreken', value: `${streken.length} streken` });
    if (appellaties.length > 0) facts.push({ label: 'Appellaties', value: `${appellaties.length} DOC/DOCG` });
    const grapes = land.main_grapes;
    const grapeList = Array.isArray(grapes)
        ? grapes.map(String)
        : typeof grapes === 'string'
            ? (() => { try { const p = JSON.parse(grapes); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } })()
            : [];
    if (grapeList.length > 0) {
        facts.push({ label: 'Kern-druiven', value: normalizeEmDashes(grapeList.slice(0, 3).join(' · ')) });
    }
    if (land.best_time_to_visit) {
        facts.push({ label: 'Beste reisseizoen', value: normalizeEmDashes(String(land.best_time_to_visit)) });
    }
    return facts;
}

/** Flatten een m2o-relatie naar de slug-string die de adapter verwacht. */
function flattenStreekRef(r: Rec): Rec {
    const ref = r.streek_id;
    if (ref && typeof ref === 'object') {
        const slug = (ref as Rec).slug;
        return { ...r, streek_id: slug ? String(slug) : undefined };
    }
    return r;
}

/**
 * Laadt de atlas voor één land-slug. Geeft `null` terug — en de pagina rendert
 * dan zonder atlas — als: Directus niet geconfigureerd is, het land niet
 * bestaat, of er geen bruikbare `map_config` (geometrie) is.
 */
export async function loadAtlasForLand(slug: string): Promise<AtlasData | null> {
    const env: DirectusEnv = readDirectusEnv();
    if (!env.configured) return null;
    const { url, token } = env;
    const filter = statusFilterQuery(env);

    // 1) Land + atlas-config. Geen map_config → geen atlas.
    const landFields = 'slug,name,infographic_kicker,map_config,facts_override,main_grapes,best_time_to_visit';
    const landRows = await getJson(
        `${url}/items/landen?limit=1&fields=${landFields}&filter[slug][_eq]=${encodeURIComponent(slug)}${filter}`,
        token,
    );
    if (!landRows || landRows.length === 0) return null;
    const land = landRows[0] as Rec;
    const mapConfig = land.map_config;
    if (!mapConfig || typeof mapConfig !== 'object') return null;

    // 2) Streken van dit land (zelfde statusfilter als /streken/ → 404-veilig).
    const streekFields = 'slug,name,zone_path,zone_color,zone_label_offset,grape_color,dominant_grape,wine_style,sort_order';
    const strekenRows = (await getJson(
        `${url}/items/streken?limit=-1&fields=${streekFields}&filter[land_id][slug][_eq]=${encodeURIComponent(slug)}${filter}&sort=sort_order`,
        token,
    )) as Rec[] | null;
    if (!strekenRows || strekenRows.length === 0) return null;

    // 3) Appellaties van dit land (optioneel — faalt zacht naar leeg).
    const appFields = 'slug,name,classification,zone_path,zone_color,sort_order,streek_id.slug';
    const appRows = ((await getJson(
        `${url}/items/appellaties?limit=-1&fields=${appFields}&filter[land_id][slug][_eq]=${encodeURIComponent(slug)}${filter}&sort=sort_order`,
        token,
    )) as Rec[] | null) ?? [];
    const appellaties = appRows.map(flattenStreekRef);

    // publishedSlugs = exact de geladen streken → drill-down kan niet 404'en.
    const publishedSlugs = strekenRows.map((r) => String(r.slug)).filter(Boolean);
    const map = mapConfigToProps(mapConfig as Rec);
    const zones = buildZones(strekenRows, appellaties, publishedSlugs);

    const kicker = land.infographic_kicker ? normalizeEmDashes(String(land.infographic_kicker)) : undefined;
    const facts = deriveFacts(land, strekenRows, appellaties);

    return { kicker, facts, map, zones };
}
