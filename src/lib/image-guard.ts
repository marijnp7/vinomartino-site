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
// slowakije (f998326f) is via DAM-metadata-audit (DevOps, LAT-2133: Malá Tŕňa,
// Slovaaks Tokaj + Wikimedia-credit) als JUIST bewezen en dus verwijderd.
// LAT-2454 (2026-07-14, Marijn-audit / staand mandaat 12b): de vijf resterende
// unverified-hero's (bierzo/kamptal/lisboa/rheingau/rueda) zijn door Marijn als
// JUIST bevestigd voor GO-LIVE en dus vrijgegeven — hun hero's renderden nul
// <img>-tags zolang ze hier stonden. De lijst is nu leeg.
const UNVERIFIED_ASSET_IDS: readonly string[] = [];

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

// LAT-2379 — durende per-streek allowlist (Optie A, approval 4bd3560c, board-
// akkoord 2026-07-14). Waar de blocklist hierboven reactief bekend-foute UUID's
// weigert, draait deze allowlist het om naar default-deny voor de streken die
// hier staan: alléén de geverifieerde asset-UUID mag als hero renderen. Zo kan
// een latere foutieve swap in Directus (hero_image → verkeerd beeld) de streek
// niet stil opnieuw een verkeerde foto geven — de code is de bron van waarheid.
//
// Streken die hier NIET staan behouden hun bestaande gedrag (blocklist +
// LAT-2427 credit-guard); deze guard blanco't dus nooit een niet-ingeschreven
// streek. De 5 onbewezen streken staan bewust op `null`: ze blijven fail-closed
// leeg tot er een asset mét regiobewijs bestaat.
const REGION_HERO_ALLOWLIST: Readonly<Record<string, string | null>> = {
    // 6 bewezen-foute streken, gecorrigeerd via LAT-2383 (sourcing) → LAT-2387 (upload):
    rioja: '49f2644d-3102-4b1c-a0b9-346156ef683e', // Ken Case, Public Domain
    'rias-baixas': 'a8b5d3db-7151-4686-889c-65d3dd786c5a', // jacilluch, CC BY-SA 2.0
    'ribera-del-duero': 'f3e3a8ec-ec48-4064-9f04-dd698d64efe5', // Pravdaverita, CC BY 3.0
    alentejo: '852dee27-6b86-4b16-87b5-a99cb537d187', // Celestino Manuel, CC BY 2.0
    'vinho-verde': '66cb57f5-c86e-443d-a499-7eca5f80d6a2', // alexandra vale, CC BY 2.0
    rhone: 'a2fcf3ec-1499-48be-a991-926c702653e1', // Ed Clayton, CC BY 2.0
    // LAT-2528/LAT-2537 (2026-07-16): de vier CC-streken kregen een geverifieerd
    // Wikimedia-regiobeeld (CC BY/BY-SA) via DAM-upload → allowlist gevuld.
    // rueda: na uitputtend CC-zoeken geen bruikbaar regio-beeld gevonden, dus
    // (AI-als-laatste-redmiddel) een AI-gegenereerd Verdejo-landschap gebruikt
    // (gpt-image-2, eigen werk VinoMartino) → geen CC-attributieplicht, staat
    // daarom NIET in hero-credit-guard.
    bierzo: '0ffe0c8e-4a35-4dec-bd9b-5aaef2dd695e', // malditofriki, CC BY 2.0
    kamptal: 'cbb47e5b-6c75-427b-a67b-953f832a0dad', // Isiwal, CC BY-SA 4.0
    lisboa: '82fc7889-d456-4d1b-9165-e485cde9feb5', // Alexey Komarov, CC BY 4.0
    rheingau: '6b06f949-de31-4fa2-b2d7-80ad905c4956', // Gerda Arendt, CC BY-SA 4.0
    rueda: 'e1ed309d-f731-4282-9677-62148668f451', // AI (gpt-image-2), eigen werk VinoMartino
};

/** True als deze streek onder allowlist-handhaving valt (Optie A, LAT-2379). */
export function regionHasHeroAllowlistEntry(slug: string | null | undefined): boolean {
    if (!slug) return false;
    return Object.prototype.hasOwnProperty.call(REGION_HERO_ALLOWLIST, slug.trim());
}

/**
 * Fail-closed per-streek allowlist. Voor een ingeschreven streek mag ALLEEN de
 * geverifieerde asset-UUID renderen; elk ander (of leeg) beeld valt terug op
 * leeg. Streken zonder allowlist-entry passeren altijd, zodat het bestaande
 * gedrag (blocklist + credit-guard) ongewijzigd blijft. Logt elke weigering.
 */
export function heroAssetAllowedForRegion(
    slug: string | null | undefined,
    assetId: string | null | undefined,
): boolean {
    if (!regionHasHeroAllowlistEntry(slug)) return true;
    const verified = REGION_HERO_ALLOWLIST[slug!.trim()];
    if (!verified) {
        console.warn(`[image-guard] LAT-2379 streek zonder geverifieerd hero-beeld → leeg: ${slug}`);
        return false;
    }
    if (assetId && assetId.trim() === verified) return true;
    console.warn(
        `[image-guard] LAT-2379 hero-asset wijkt af van allowlist voor ${slug} → leeg ` +
            `(kreeg ${assetId ?? 'null'}, verwacht ${verified})`,
    );
    return false;
}
