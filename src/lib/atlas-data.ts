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
import { DEFAULT_LOCALE, type Locale } from './i18n';
import { fetchTranslationOverlay } from './directus-i18n';
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
 * LAT-2575 — zachte overlay voor de atlas: legt vertaalde velden over de rauwe
 * rijen zonder de no-translation-guard toe te passen. Anders dan de
 * paginaloaders mag een ontbrekende appellatie-/streek-vertaling de infographic
 * niet uit de kaartgeometrie laten vallen (dat zou de zones breken); onvertaalde
 * labels vallen simpelweg terug op NL. Voor de standaardtaal is dit een no-op.
 */
async function softOverlay(
    rows: Rec[],
    env: DirectusEnv,
    junction: string,
    parentIdField: string,
    fields: string[],
    locale: Locale,
    idKey = 'id',
): Promise<Rec[]> {
    if (locale === DEFAULT_LOCALE) return rows;
    const overlay = await fetchTranslationOverlay({ env, junction, parentIdField, fields, locale });
    return rows.map((r) => {
        const translated = overlay.get(String(r[idKey] ?? ''));
        return translated ? { ...r, ...translated } : r;
    });
}

/**
 * Laadt de atlas voor één land-slug. Geeft `null` terug — en de pagina rendert
 * dan zonder atlas — als: Directus niet geconfigureerd is, het land niet
 * bestaat, of er geen bruikbare `map_config` (geometrie) is.
 */
export async function loadAtlasForLand(slug: string, locale: Locale = DEFAULT_LOCALE): Promise<AtlasData | null> {
    const env: DirectusEnv = readDirectusEnv();
    if (!env.configured) return null;
    const { url, token } = env;
    const filter = statusFilterQuery(env);

    // 1) Land + atlas-config. Geen map_config → geen atlas.
    const landFields = 'id,slug,name,infographic_kicker,map_config,facts_override,main_grapes,best_time_to_visit';
    const landRowsRaw = await getJson(
        `${url}/items/landen?limit=1&fields=${landFields}&filter[slug][_eq]=${encodeURIComponent(slug)}${filter}`,
        token,
    );
    if (!landRowsRaw || landRowsRaw.length === 0) return null;
    const [land] = await softOverlay(
        landRowsRaw as Rec[], env, 'landen_translations', 'landen_id',
        ['infographic_kicker', 'best_time_to_visit'], locale,
    );
    const mapConfig = land.map_config;
    if (!mapConfig || typeof mapConfig !== 'object') return null;

    // 2) Streken van dit land (zelfde statusfilter als /streken/ → 404-veilig).
    const streekFields = 'id,slug,name,zone_path,zone_color,zone_label_offset,grape_color,dominant_grape,wine_style,sort_order';
    const strekenRowsRaw = (await getJson(
        `${url}/items/streken?limit=-1&fields=${streekFields}&filter[land_id][slug][_eq]=${encodeURIComponent(slug)}${filter}&sort=sort_order`,
        token,
    )) as Rec[] | null;
    if (!strekenRowsRaw || strekenRowsRaw.length === 0) return null;
    const strekenRows = await softOverlay(
        strekenRowsRaw, env, 'streken_translations', 'streken_id', ['name'], locale,
    );

    // 3) Appellaties van dit land (optioneel — faalt zacht naar leeg).
    const appFields = 'id,slug,name,classification,zone_path,zone_color,sort_order,streek_id.slug';
    const appRowsRaw = ((await getJson(
        `${url}/items/appellaties?limit=-1&fields=${appFields}&filter[land_id][slug][_eq]=${encodeURIComponent(slug)}${filter}&sort=sort_order`,
        token,
    )) as Rec[] | null) ?? [];
    const appRows = await softOverlay(
        appRowsRaw, env, 'appellaties_translations', 'appellaties_id', ['classification'], locale,
    );
    const appellaties = appRows.map(flattenStreekRef);

    // publishedSlugs = exact de geladen streken → drill-down kan niet 404'en.
    const publishedSlugs = strekenRows.map((r) => String(r.slug)).filter(Boolean);
    const map = mapConfigToProps(mapConfig as Rec);
    const zones = buildZones(strekenRows, appellaties, publishedSlugs);

    const kicker = land.infographic_kicker ? normalizeEmDashes(String(land.infographic_kicker)) : undefined;
    const facts = deriveFacts(land, strekenRows, appellaties);

    return { kicker, facts, map, zones };
}
