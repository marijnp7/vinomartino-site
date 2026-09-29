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

import { loadDamFileMeta, resetDamFileMetaCache, type DamFileMeta } from './dam-file-meta';

/**
 * Identiek aan de regex in /paperclip/ops/lat4745-synth-inventory.mjs. Draait
 * over de JSON van [title, description, tags, filename_download] van elk
 * bestand — dezelfde vier velden, zodat site en detector niet kunnen divergeren.
 */
export const SYNTHETIC_META_RE =
    /synthetisch|synthetic|ai-render|ai render|ai-gegenereerd|ai gegenereerd|midjourney|dall-?e|stable diffusion|gpt-image|vinomartino \/ atelier/i;

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

/**
 * True als dit bestand AI-/synthetisch is. LAT-12054: het DAM-veld
 * `directus_files.synthetisch` is de bron van waarheid; de regex over titel,
 * beschrijving, tags en bestandsnaam blijft daarnaast gelden (zo vangt hij ook
 * beeld dat nog niet is bijgewerkt). Het veld kan alleen aanzetten: `false`
 * schakelt een regex-treffer niet uit.
 */
export function fileMetaIsSynthetic(file: DamFileMeta): boolean {
    if (file.synthetisch === true) return true;
    return SYNTHETIC_META_RE.test(
        JSON.stringify([file.title, file.description, file.tags, file.filename_download]),
    );
}

/** Alleen voor tests — gooit de memoisatie weg. */
export function resetSyntheticImageCache(): void {
    cache = null;
    resetDamFileMetaCache();
}

// Eén set per build: `loadSyntheticImageIds()` wordt door elke detailpagina aangeroepen.
let cache: Promise<ReadonlySet<string>> | null = null;

async function deriveSyntheticImageIds(): Promise<ReadonlySet<string>> {
    const files = await loadDamFileMeta();
    const synthetic = new Set(
        [...files.values()].filter(fileMetaIsSynthetic).map((f) => String(f.id).toLowerCase()),
    );
    const viaVeld = [...files.values()].filter((f) => f.synthetisch === true).length;
    console.log(
        `[loadSyntheticImages] ${synthetic.size}/${files.size} DAM-bestanden aangemerkt als AI/synthetisch ` +
            `(${viaVeld} via veld synthetisch, rest via regex; LAT-4776/LAT-12054).`,
    );
    return synthetic;
}

/**
 * Set van `directus_files.id` (lowercase) die volgens de DAM-metadata AI-
 * gegenereerd of anderszins synthetisch zijn. Gememoiseerd per build.
 */
export function loadSyntheticImageIds(): Promise<ReadonlySet<string>> {
    if (!cache) {
        cache = deriveSyntheticImageIds().catch((err) => {
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
