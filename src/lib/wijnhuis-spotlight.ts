// LAT-13075 — "Wijnhuis in de spotlight". Bron: Directus `wijnhuis_spotlight`
// (schema: directus/scripts/lat13075-wijnhuis-spotlight-schema.mjs).
//
// Timing op een statische site: de build rendert alle geldige selecties waarvan het
// venster nog niet voorbij is en die vóór `SPOTLIGHT_HORIZON_MS` starten, met hun
// start/einde als data-attributen. Een klein inline-script kiest in de browser op de
// klok van nú (zelfde regel als `pickActive`), dus een verlopen spotlight verdwijnt
// en een geplande verschijnt zonder build of cache-purge. Zonder JS toont de HTML de
// winnaar op buildtijd; de nachtelijke deploy-cron (deploy.yml, 02:00 UTC) begrenst
// die veroudering tot één dag. Geen nieuwe routine.
import { readDirectusEnv, fetchDirectusCollection } from './directus-config';
import { loadDamFileMeta } from './dam-file-meta';
import type { Wijnhuis } from './wijnhuizen';
import type { Locale } from './i18n';
import { validateSpotlights, renderCandidates, hasConfirmedLicense, type SpotlightRow, type SpotlightEntry } from './wijnhuis-spotlight-rules';
export * from './wijnhuis-spotlight-rules';

async function fetchRows(): Promise<SpotlightRow[]> {
    const env = readDirectusEnv();
    if (!env.configured) return [];
    const fields = 'id,status,start_at,end_at,campagne_id,teaser,wijnhuis.slug,translations.languages_code,translations.teaser';
    try {
        const res = await fetchDirectusCollection('loadSpotlight', `${env.url}/items/wijnhuis_spotlight?limit=-1&fields=${fields}&filter[status][_eq]=published`, {
            headers: { Authorization: `Bearer ${env.token}` },
        });
        // Collectie nog niet aangemaakt of niet leesbaar: blok weg, build gaat door.
        if (!res.ok) { console.warn(`[loadSpotlight] HTTP ${res.status}: geen spotlight`); return []; }
        const data = ((await res.json()) as { data?: Record<string, unknown>[] }).data || [];
        return data.map((d) => {
            const tr = Array.isArray(d.translations) ? d.translations as Record<string, unknown>[] : [];
            const en = tr.find((t) => String(t.languages_code || '').startsWith('en'));
            const huis = d.wijnhuis && typeof d.wijnhuis === 'object' ? d.wijnhuis as Record<string, unknown> : {};
            return {
                id: Number(d.id),
                status: String(d.status || ''),
                wijnhuisSlug: String(huis.slug || ''),
                startAt: String(d.start_at || ''),
                endAt: String(d.end_at || ''),
                campagneId: String(d.campagne_id || ''),
                teaserNl: String(d.teaser || ''),
                teaserEn: String(en?.teaser || ''),
            };
        });
    } catch (err) {
        console.warn(`[loadSpotlight] ${String(err)}: geen spotlight`);
        return [];
    }
}

let rowsPromise: Promise<SpotlightRow[]> | null = null;

export async function loadSpotlight(huizen: Wijnhuis[], locale: Locale, buildNow = Date.now()): Promise<SpotlightEntry[]> {
    rowsPromise ??= fetchRows();
    const rows = await rowsPromise;
    // Beeldrecht = een bevestigde DAM-licentie op de hero. `getImageCredit` is hier niet
    // bruikbaar: die geeft alleen iets terug voor CC BY-licenties (attributieplicht).
    const meta = await loadDamFileMeta();
    const credited = new Set<string>();
    for (const h of huizen) {
        if (h.heroImageId && hasConfirmedLicense(meta.get(String(h.heroImageId).toLowerCase())?.licentie)) credited.add(h.slug);
    }
    const { entries, rejected } = validateSpotlights(rows, huizen, locale, (h) => credited.has(h.slug));
    for (const r of rejected) console.warn(`[loadSpotlight] ${locale} spotlight ${r.id} afgewezen: ${r.reason}`);
    const out = renderCandidates(entries, buildNow);
    console.log(`[loadSpotlight] ${locale}: ${rows.length} rijen, ${entries.length} geldig, ${out.length} in HTML`);
    return out;
}
