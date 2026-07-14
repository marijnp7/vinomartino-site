// LAT-2427 — verplichte-attributie guard voor streek-hero's (P0, 2026-07-14).
//
// Waarom: vijf van de zes vervang-hero's uit LAT-2383/LAT-2387 dragen een
// CC BY- of CC BY-SA-licentie. Die licenties eisen zichtbare naamsvermelding +
// licentievermelding + bronlink. Zonder credit is het tonen van het beeld een
// licentieschending — precies het soort reputatie-/juridisch risico dat we niet
// willen dragen.
//
// Deze guard weigert fail-closed, net als de regio-guard (LAT-2361): een asset
// waarvan de licentie attributie vereist mag NOOIT renderen zonder complete
// credit. Ontbreekt de credit, dan valt de hero terug op leeg — nooit op een
// naamloos getoond CC-beeld.
//
// De credit-inhoud (fotograaf/licentie/bron) komt uit het Directus-veld
// `streken.hero_credit`; deze module bevat alléén de handhavingslijst: welke
// DAM-asset-UUID's een attributie-plichtige licentie dragen. De lijst is
// gesleuteld op het file-UUID zodat de plicht het beeld volgt, niet de slug
// (zelfde rationale als LAT-1687). Wisselt een streek naar een rechtenvrij
// beeld, dan verdwijnt zijn UUID hier.

import type { HeroCredit } from './streken';

// Assets met een licentie die zichtbare naamsvermelding eist (CC BY / CC BY-SA).
// Publiek-domein-hero's (bv. rioja) staan hier bewust NIET: attributie mag daar
// wel, maar is niet verplicht, dus die worden niet fail-closed geblokkeerd.
const CREDIT_REQUIRED_ASSET_IDS: ReadonlySet<string> = new Set([
    'a8b5d3db-7151-4686-889c-65d3dd786c5a', // rias-baixas — jacilluch, CC BY-SA 2.0
    'f3e3a8ec-ec48-4064-9f04-dd698d64efe5', // ribera-del-duero — Pravdaverita, CC BY 3.0
    '852dee27-6b86-4b16-87b5-a99cb537d187', // alentejo — Celestino Manuel, CC BY 2.0
    '66cb57f5-c86e-443d-a499-7eca5f80d6a2', // vinho-verde — alexandra vale, CC BY 2.0
    'a2fcf3ec-1499-48be-a991-926c702653e1', // rhone — Ed Clayton, CC BY 2.0
]);

/** True als deze DAM-asset een attributie-plichtige licentie draagt. */
export function creditRequiredForAsset(assetId: string | null | undefined): boolean {
    if (!assetId) return false;
    return CREDIT_REQUIRED_ASSET_IDS.has(assetId.trim());
}

/**
 * Een credit is pas bruikbaar voor naamsvermelding als fotograaf, licentie én
 * bronlink alle drie aanwezig zijn. Een half gevuld credit-veld voldoet niet aan
 * de licentie en telt dus als "geen credit".
 */
export function heroCreditIsComplete(credit: HeroCredit | null | undefined): boolean {
    if (!credit) return false;
    return Boolean(credit.author.trim() && credit.licenseLabel.trim() && credit.sourceUrl.trim());
}

/**
 * Fail-closed hero-guard. Geeft `false` terug (= hero NIET renderen) zodra de
 * asset een verplichte-attributie-licentie draagt maar er geen complete credit
 * beschikbaar is. Logt de weigering met bron voor de audit-trail. Assets zonder
 * attributieplicht (publiek domein / Unsplash) passeren altijd.
 */
export function heroImageAllowed(
    assetId: string | null | undefined,
    credit: HeroCredit | null | undefined,
): boolean {
    if (!creditRequiredForAsset(assetId)) return true;
    if (heroCreditIsComplete(credit)) return true;
    console.warn(
        `[hero-credit-guard] LAT-2427 CC-hero geweigerd zonder complete credit (fail-closed): ${assetId}. ` +
            `Vul streken.hero_credit (fotograaf/licentie/bron) voordat dit beeld weer rendert.`,
    );
    return false;
}
