// LAT-2361 — beeld/regio-mismatch guard (P0, 2026-07-13).
//
// Waarom: op productie stond o.a. een "Champagne Bollinger"-bord als hero op
// /streken/rioja/. Een fout-gekoppeld beeld is erger dan geen beeld
// (AGENTS.md — lege hero > foute hero). Deze guard weigert hard: een
// geblokkeerde DAM-asset wordt NOOIT gerenderd en valt terug op leeg — nooit
// op een willekeurige vervangfoto.
//
// De blocklist is de acute mitigatie (render-laag; geen Directus-write nodig).
// Zodra een asset via DAM-regiobewijs is goedgekeurd of het Directus-veld
// leeggemaakt is, kan de betreffende UUID hier weg.

// Bewezen fout (visuele audit van alle 347 streek-beelden, 2026-07-13).
const HARD_FAIL_ASSET_IDS: readonly string[] = [
    '5a62eda2-4738-4411-98cc-664d5baa5749', // rioja — bord "Champagne Bollinger" (Aÿ, Champagne)
    '57eb395f-ec10-4928-9f38-8829d3d5c9e6', // rias-baixas — domein "Lucien Crochet" (Sancerre, Loire)
    'ad9bf686-3d7b-417c-b557-32aff5bc1cf5', // alentejo — zelfde Lucien Crochet-foto (Loire)
    'bf04e1ef-4b15-4e8e-9091-a5b57f008b37', // ribera-del-duero — fles "Tentenublo" (Rioja-producent)
    'd77a8ae5-a23a-4424-be31-85af3f781435', // vinho-verde — mediterraan rotsmassief (niet NW-Portugal)
    'fe384443-cf2f-4548-961c-0f25dad6bf05', // rhone — identiek aan accommodatiefoto, niet verifieerbaar
];

// Te verifiëren (generiek beeld uit dezelfde batch, geen regiobewijs). Geblokkeerd
// tot het tegendeel bewezen is (issue-opdracht: ga uit van dezelfde fout).
const UNVERIFIED_ASSET_IDS: readonly string[] = [
    '14f965cf-6ecb-4273-8f7a-00f23b937699', // bierzo
    'f151dce7-fae7-4f74-aecf-942940a4922f', // kamptal
    'a001200e-d1ab-4702-a045-1e9afbc13c86', // lisboa
    'f2ff4d51-47f4-41d2-9628-b7898b62e9e6', // rheingau
    'f66d64ae-bf0a-45d4-82a1-faa89ef896ef', // rueda
    'f998326f-44e2-4cd7-9803-c0fe9cfce6fd', // slowakije
];

const BLOCKED_ASSET_IDS: ReadonlySet<string> = new Set([
    ...HARD_FAIL_ASSET_IDS,
    ...UNVERIFIED_ASSET_IDS,
]);

/** True als deze DAM-asset op de blocklist staat en dus niet gerenderd mag worden. */
export function isBlockedAsset(assetId: string | null | undefined): boolean {
    if (!assetId) return false;
    return BLOCKED_ASSET_IDS.has(assetId.trim());
}

/**
 * Fail-closed hero-guard voor de download-laag. Geeft `null` terug (= geen
 * beeld) zodra de asset geblokkeerd is, zodat de site nooit een fout-gekoppeld
 * beeld ophaalt of toont. Logt de weigering met bron voor de audit-trail.
 */
export function assertAssetAllowed(assetId: string | null | undefined): boolean {
    if (isBlockedAsset(assetId)) {
        console.warn(`[image-guard] LAT-2361 geblokkeerd beeld geweigerd (fout-gekoppelde regio): ${assetId}`);
        return false;
    }
    return true;
}
