// LAT-13075 — wijnhuizen-keuzehulp: build-time zoek- en filterdata voor /wijnhuizen/.
// Puur en zonder Directus-toegang, zodat de client alleen deze lichte dataset krijgt.

/** Diacritiek- en hoofdlettervrij, voor vergevingsgezind zoeken ("Spätburgunder" = "spatburgunder"). */
export function foldText(s: string): string {
    return (s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/ß/g, 'ss')
        .replace(/['’`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Canonieke druif-id's. ALLEEN synoniemen die ampelografisch dezelfde variëteit zijn;
// elke toevoeging vraagt een redactionele toets (Lead Editor, LAT-13075). Wat hier niet
// staat blijft een eigen druif (bv. Malvasia en Malvasia Nera worden níet samengevoegd).
const DRUIF_SYNONIEMEN: Record<string, { label: string; namen: string[] }> = {
    'pinot-noir': { label: 'Pinot Noir', namen: ['pinot noir', 'pinot nero', 'spatburgunder'] },
    'meunier': { label: 'Meunier', namen: ['meunier', 'pinot meunier'] },
    'pinot-blanc': { label: 'Pinot Blanc', namen: ['pinot blanc', 'pinot bianco', 'weissburgunder'] },
    'pinot-grigio': { label: 'Pinot Grigio', namen: ['pinot grigio', 'pinot gris'] },
    'syrah': { label: 'Syrah', namen: ['syrah', 'shiraz'] },
    'sangiovese': { label: 'Sangiovese', namen: ['sangiovese', 'sangiovese prugnolo gentile', 'prugnolo gentile'] },
    'sauvignon-blanc': { label: 'Sauvignon Blanc', namen: ['sauvignon blanc', 'sauvignon'] },
};

const SYNONIEM_INDEX = new Map<string, string>();
for (const [id, { namen }] of Object.entries(DRUIF_SYNONIEMEN)) {
    for (const n of namen) SYNONIEM_INDEX.set(n, id);
}

export interface DruifRef { id: string; label: string }

/** CMS-druifnaam → canonieke id + label. Onbekende namen worden hun eigen id. */
export function canonicalDruif(naam: string): DruifRef {
    const key = foldText(naam);
    const id = SYNONIEM_INDEX.get(key);
    if (id) return { id, label: DRUIF_SYNONIEMEN[id].label };
    return { id: key.replace(/\s+/g, '-'), label: naam.trim() };
}

/** Alle zoektermen voor een druif: de CMS-naam plus de bekende synoniemen. */
export function druifZoektermen(naam: string): string[] {
    const ref = canonicalDruif(naam);
    const syn = DRUIF_SYNONIEMEN[ref.id]?.namen ?? [];
    return [foldText(naam), ...syn];
}
