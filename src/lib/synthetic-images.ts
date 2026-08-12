/**
 * LAT-4776 — beeld-niveau disclosure voor AI-/synthetisch beeld.
 *
 * DESIGN_GUIDELINES §7 schrijft voor dat AI-Tier 2-beeld voor de lezer
 * herkenbaar moet zijn. Die toepassingsregel noemde de badge "Redactiegids",
 * maar die badge bestond al voor iets anders: `ZelfGereisdBadge.astro` is een
 * zuivere functie van `articles.zelf_gereisd` (reisprovenance, LAT-1958/
 * LAT-1996) en heeft geen enkele binding met het beeld. Hij staat op 73 van de
 * 77 gepubliceerde artikelen — ook bij een 100% echte foto — en ontbreekt op
 * een AI-illustratie waar de redactie wél is geweest. Twee signalen op één
 * label; daarom draagt deze module een eigen formulering en hergebruikt hij het
 * woord "Redactiegids" NIET.
 *
 * ── Bron van waarheid ────────────────────────────────────────────────────────
 * De markering is gebonden aan het BESTAND (`directus_files`), niet aan het
 * artikel: hetzelfde beeld op een andere pagina moet dezelfde disclosure
 * krijgen, en een vervangen hero moet de disclosure vanzelf kwijtraken.
 *
 * De populatie wordt élke build opnieuw uit `directus_files` afgeleid met exact
 * dezelfde velden en dezelfde regex als de detector-inventaris
 * `/paperclip/ops/lat4745-synth-inventory.mjs`. Dat is opzet: de site en de
 * detector moeten het over dezelfde verzameling eens zijn, anders meldt de
 * detector rood op beeld dat de site voor "niet synthetisch" houdt (of erger:
 * omgekeerd). Wijzigt de detector-regex, dan MOET SYNTHETIC_META_RE mee.
 *
 * NOOIT een gehardcodeerde id-lijst. Dat is precies het faalpatroon dat
 * LAT-4713 → LAT-4725 → LAT-4729 → LAT-4761 vier rondes lang liet terugkomen:
 * een lijst dekt de beelden van gisteren en is blind voor die van vandaag.
 */

import {
    readDirectusEnv,
    assertDirectusConfigured,
    assertCollectionReadableOrDegrade,
    fetchDirectusCollection,
    type DirectusEnv,
} from './directus-config';

/**
 * Identiek aan de regex in /paperclip/ops/lat4745-synth-inventory.mjs. Draait
 * over de JSON van [title, description, tags, filename_download] van elk
 * bestand — dezelfde vier velden, zodat site en detector niet kunnen divergeren.
 */
export const SYNTHETIC_META_RE =
    /synthetisch|synthetic|ai-render|ai render|ai-gegenereerd|ai gegenereerd|midjourney|dall-?e|stable diffusion|gpt-image|vinomartino \/ atelier/i;

/** De vier velden waarover de regex draait. Zelfde set als de inventaris. */
const FILE_FIELDS = 'id,title,description,tags,filename_download';

/**
 * Locale-onafhankelijke, machineleesbare marker op de figcaption.
 *
 * De detector (lat4745-synth-disclosure-detector.py) zoekt in de gerenderde
 * HTML naar o.a. `ai-gegenereerd`. De NL-copy bevat dat woord, de EN-copy niet
 * — en /en/-pagina's staan óók in de sitemap. Dit attribuut draagt de term dus
 * in beide talen, zodat de disclosure meetbaar is zonder de detector-regex per
 * taal te moeten uitbreiden. Waarde niet wijzigen zonder de detector mee.
 */
export const SYNTHETIC_MARKER_ATTR = 'ai-gegenereerd';

interface DirectusFileMeta {
    id: string;
    title: string | null;
    description: string | null;
    tags: unknown;
    filename_download: string | null;
}

/** True als de metadata van dit bestand het als AI-/synthetisch aanmerkt. */
export function fileMetaIsSynthetic(file: DirectusFileMeta): boolean {
    return SYNTHETIC_META_RE.test(
        JSON.stringify([file.title, file.description, file.tags, file.filename_download]),
    );
}

// Eén fetch per build: `loadSyntheticImageIds()` wordt door elke detailpagina
// aangeroepen (honderden keren) en /files?limit=-1 is ~765 rijen.
let cache: Promise<ReadonlySet<string>> | null = null;

/** Alleen voor tests — gooit de memoisatie weg. */
export function resetSyntheticImageCache(): void {
    cache = null;
}

async function fetchSyntheticImageIds(env: DirectusEnv): Promise<ReadonlySet<string>> {
    const url = `${env.url}/files?limit=-1&fields=${FILE_FIELDS}`;
    const res = await fetchDirectusCollection('loadSyntheticImages', url, {
        headers: { Authorization: `Bearer ${env.token}` },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        // In productie gooit dit: zonder de DAM-metadata weten we niet wélk
        // beeld synthetisch is, en dan zou de build stilzwijgend een pagina
        // zonder §7-disclosure publiceren. Preview/dev mag degraderen.
        assertCollectionReadableOrDegrade(
            'loadSyntheticImages',
            'directus_files',
            res.status,
            env,
            body.slice(0, 200),
        );
        return new Set();
    }

    const json = await res.json();
    const files = (json.data || []) as DirectusFileMeta[];

    // Falsifieerbaarheid: 0 bestanden is geen "geen synthetisch beeld", dat is
    // een kapotte query of een leeggelopen permissie. Dan liever hard stuk dan
    // een site vol ongemarkeerd AI-beeld (LAT-4745-les).
    if (files.length === 0) {
        assertCollectionReadableOrDegrade(
            'loadSyntheticImages',
            'directus_files',
            res.status,
            env,
            'query gaf 0 bestanden — dat is een kapotte fields/permissie-situatie, geen lege DAM',
        );
        return new Set();
    }

    const synthetic = new Set(files.filter(fileMetaIsSynthetic).map((f) => String(f.id).toLowerCase()));
    console.log(
        `[loadSyntheticImages] ${synthetic.size}/${files.length} DAM-bestanden aangemerkt als AI/synthetisch ` +
            `(LAT-4776, zelfde regex als lat4745-synth-inventory.mjs).`,
    );
    return synthetic;
}

/**
 * Set van `directus_files.id` (lowercase) die volgens de DAM-metadata AI-
 * gegenereerd of anderszins synthetisch zijn. Gememoiseerd per build.
 */
export function loadSyntheticImageIds(): Promise<ReadonlySet<string>> {
    if (!cache) {
        const env = readDirectusEnv();
        assertDirectusConfigured('loadSyntheticImages', env);
        cache = fetchSyntheticImageIds(env).catch((err) => {
            cache = null; // een mislukte poging mag geen permanente lege set worden
            throw err;
        });
    }
    return cache;
}

/**
 * Haalt een Directus file-UUID uit een asset-URL of pad. De render-componenten
 * hebben lang niet altijd een los `...ImageId`-veld bij de hand; de UUID zit
 * dan in `/assets/<uuid>?…` of in het gebuildde `/images/<map>/<uuid>.jpg`.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function assetIdFromSrc(src: string | null | undefined): string | null {
    if (!src) return null;
    const m = UUID_RE.exec(src);
    return m ? m[0].toLowerCase() : null;
}

/**
 * Resolve-helper voor de componenten: geef het expliciete file-id én/of de
 * gerenderde src mee, dan bepaalt deze functie of er een disclosure hoort.
 */
export function isSyntheticImage(
    syntheticIds: ReadonlySet<string>,
    fileId: string | null | undefined,
    src?: string | null,
): boolean {
    const id = (fileId && String(fileId).toLowerCase()) || assetIdFromSrc(src);
    return Boolean(id && syntheticIds.has(id));
}

/** Naam van het machineleesbare attribuut; zelfde op hero en kaart. */
export const SYNTHETIC_MARKER_DATA_ATTR = 'data-beeldherkomst';

/**
 * LAT-5467 — kaart-/thumbnail-variant van de disclosure.
 *
 * Op een overzichtspagina (`/`, `/artikelen/`, `/streken/`, `/landen/*`) staat
 * hetzelfde bestand als kaart-thumbnail. `BeeldHerkomst.astro` past daar niet:
 * dat rendert een zichtbaar bijschrift dat op een kaart niet gewenst is, en de
 * kaart-<figure>s dragen al een eigen figcaption (er mag er maar één zijn).
 *
 * Deze helper geeft daarom alléén het machineleesbare attribuut terug, te
 * spreiden over de <img> zelf:
 *
 *     <img src={src} {...syntheticImageAttrs(ids, fileId, src)} />
 *
 * Waarom op de <img> en niet in een extra element: een wrapper zou de
 * card-grid-layout raken, en het attribuut hoort semantisch bij het beeld dat
 * het beschrijft — zo blijft de marker ook kloppen als er meerdere beelden op
 * één kaartpagina staan.
 *
 * Dit vervangt de per-bestand `disclosed_elsewhere`-acks in
 * /paperclip/ops/lat4745-acks.json: die schaalden mee met elk nieuw AI-hero-
 * artikel (2+ regels per stuk) en zijn precies de hardgecodeerde scope waar
 * LAT-4713 → 4725 → 4729 → 4761 vier rondes lang op stukliep.
 */
export function syntheticImageAttrs(
    syntheticIds: ReadonlySet<string>,
    fileId: string | null | undefined,
    src?: string | null,
): Record<string, string> {
    return isSyntheticImage(syntheticIds, fileId, src)
        ? { [SYNTHETIC_MARKER_DATA_ATTR]: SYNTHETIC_MARKER_ATTR }
        : {};
}
