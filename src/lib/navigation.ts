import { readDirectusEnv, statusFilterQuery } from './directus-config';

export interface NavItem {
    label: string;
    href: string;
    key: string;
    order: number;
}

// LAT-1032 (HARDE REGEL 3, geen hardcoded nav): de topnav wordt weer uit de
// Directus `nav_items`-collectie geladen, editbaar in het CMS. De onderstaande
// lijst is GEEN runtime-bron meer maar een safety-fallback: hij rendert alleen
// als Directus niet geconfigureerd is (bv. lokale build zonder CMS) of als de
// collectie leeg terugkomt — een lege header mag nooit uitgeserveerd worden.
//
// LAT-1591-context: de nav moet een KLEINE, curated set blijven (Landen,
// Streken en Wijnroutes leven in de /ontdek-atlas-hub, niet als losse nav-tabs).
// Dat blijft nu een redactionele discipline in Directus i.p.v. een code-slot.
// De seed (directus/scripts/seed-navigation.mjs) is autoritatief voor de
// gewenste set en snoeit afwijkende rijen weg.
const FALLBACK_ITEMS: NavItem[] = [
    { label: 'Ontdek', href: '/ontdek/', key: 'ontdek', order: 5 },
    { label: 'Wijnhuizen', href: '/wijnhuizen/', key: 'wijnhuizen', order: 30 },
    { label: 'Overnachten', href: '/accommodaties/', key: 'accommodaties', order: 35 },
    { label: 'Artikelen', href: '/artikelen/', key: 'artikelen', order: 50 },
    { label: 'De brief', href: '/de-brief/', key: 'de-brief', order: 60 },
    { label: 'Ons verhaal', href: '/over-ons/', key: 'over-ons', order: 70 },
];

function sorted(items: NavItem[]): NavItem[] {
    return [...items].sort((a, b) => a.order - b.order);
}

export async function loadNavigation(): Promise<NavItem[]> {
    const env = readDirectusEnv();

    // Lokale/dev-build zonder CMS: gebruik de fallback zodat de header blijft
    // renderen. In prod is Directus altijd geconfigureerd, dus dit pad is de
    // uitzondering, niet de norm.
    if (!env.configured) {
        console.warn('[loadNavigation] Directus not configured — using fallback nav');
        return sorted(FALLBACK_ITEMS);
    }

    const fields = 'label,href,key,order,status';
    const url = `${env.url}/items/nav_items?limit=-1&fields=${fields}${statusFilterQuery(env)}&sort=order`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.token}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `[loadNavigation] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
        );
    }
    const json = await res.json();
    const rows = (json.data || []) as Record<string, unknown>[];
    const items = rows
        .filter((r) => r.label && r.href && r.key)
        .map((r) => ({
            label: String(r.label),
            href: String(r.href),
            key: String(r.key),
            order: Number(r.order ?? 0),
        }));

    // Nooit een lege header serveren: als de collectie (nog) leeg is, val terug
    // op de curated set i.p.v. een nav zonder items te renderen.
    if (items.length === 0) {
        console.warn('[loadNavigation] nav_items empty in Directus — using fallback nav');
        return sorted(FALLBACK_ITEMS);
    }

    console.log(`[loadNavigation] loaded ${items.length} nav_items from Directus`);
    return sorted(items);
}
