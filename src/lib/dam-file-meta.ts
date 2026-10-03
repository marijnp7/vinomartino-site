/**
 * LAT-12054 — één gememoiseerde DAM-read van de beeldmetadata per build.
 *
 * `directus_files` draagt sinds de beeldaudit van 29-09-2026 op elk live beeld
 * `licentie` + `herkomst` (naamsvermelding) en `synthetisch` (AI-vlag). Zowel
 * `image-credits.ts` als `synthetic-images.ts` lezen dezelfde rijen; één fetch
 * voorkomt dat elke detailpagina de ~800 rijen opnieuw ophaalt.
 *
 * De build-rol moet `licentie`, `herkomst` en `synthetisch` op `directus_files`
 * kunnen lezen. Ontbreekt dat, dan geeft Directus 403 en faalt de productiebuild
 * luid (assertCollectionReadableOrDegrade) in plaats van stil zonder credits te
 * publiceren.
 */

import {
    readDirectusEnv,
    assertDirectusConfigured,
    assertCollectionReadableOrDegrade,
    fetchDirectusCollection,
    type DirectusEnv,
} from './directus-config';

export interface DamFileMeta {
    id: string;
    title: string | null;
    description: string | null;
    tags: unknown;
    filename_download: string | null;
    synthetisch?: boolean | null;
    licentie?: string | null;
    herkomst?: string | null;
}

/** Zelfde vier velden als de detector-inventaris, plus de drie DAM-velden van LAT-12054. */
const FILE_FIELDS = 'id,title,description,tags,filename_download,synthetisch,licentie,herkomst';

let cache: Promise<ReadonlyMap<string, DamFileMeta>> | null = null;

/** Alleen voor tests — gooit de memoisatie weg. */
export function resetDamFileMetaCache(): void {
    cache = null;
}

async function fetchDamFileMeta(env: DirectusEnv): Promise<ReadonlyMap<string, DamFileMeta>> {
    const url = `${env.url}/files?limit=-1&fields=${FILE_FIELDS}`;
    const res = await fetchDirectusCollection('loadDamFileMeta', url, {
        headers: { Authorization: `Bearer ${env.token}` },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        assertCollectionReadableOrDegrade('loadDamFileMeta', 'directus_files', res.status, env, body.slice(0, 200));
        return new Map();
    }

    const json = await res.json();
    const files = (json.data || []) as DamFileMeta[];

    // 0 bestanden is een kapotte query of leeggelopen permissie, geen lege DAM (LAT-4745-les).
    if (files.length === 0) {
        assertCollectionReadableOrDegrade(
            'loadDamFileMeta',
            'directus_files',
            res.status,
            env,
            'query gaf 0 bestanden — dat is een kapotte fields/permissie-situatie, geen lege DAM',
        );
        return new Map();
    }

    return new Map(files.map((f) => [String(f.id).toLowerCase(), f]));
}

/** `directus_files.id` (lowercase) → metadata. Gememoiseerd per build. */
export function loadDamFileMeta(): Promise<ReadonlyMap<string, DamFileMeta>> {
    if (!cache) {
        const env = readDirectusEnv();
        assertDirectusConfigured('loadDamFileMeta', env);
        cache = fetchDamFileMeta(env).catch((err) => {
            cache = null; // een mislukte poging mag geen permanente lege map worden
            throw err;
        });
    }
    return cache;
}
