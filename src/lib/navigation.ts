import { readDirectusEnv, statusFilterQuery, fetchDirectusCollection } from './directus-config';

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

/**
 * LAT-3329 — build-cache, zelfde patroon als `loadUiStrings()` (LAT-3319).
 *
 * `loadNavigation()` hangt in `SiteHeader.astro` en draait dus één keer per
 * *pagina*: in run 30701533851 (604 pagina's) 601 keer dezelfde 7 rijen
 * ophalen. Die rijen zijn de hele build onveranderd. Onder buildload slaat
 * Directus' pressure-limiter aan en antwoordt `503`, waarna
 * `fetchDirectusCollection` per poging 2000 ms slaapt (LAT-2779) — precies wat
 * in run 30709928435 op `ui_strings` gebeurde en daar twee prod-deploys tegen
 * de `timeout-minutes: 30` van deploy.yml aan duwde. Dat `nav_items` toen niet
 * óók 503 gaf was toeval, niet ontwerp.
 *
 * We cachen de *promise* zodat gelijktijdige renders dezelfde fetch delen.
 *
 * Degradatie-regel (het belangrijkste deel): alleen een Directus-gedekt,
 * niet-leeg resultaat blijft staan. Een fetch-fout gooit — dan wissen we de
 * cache zodat de volgende pagina het gewoon opnieuw probeert. En een lege
 * `nav_items`-respons valt terug op `FALLBACK_ITEMS`; die terugval mag niet
 * blijven plakken, anders pint één toevallig lege of half-gemigreerde read een
 * verouderde header op de hele site vast. De niet-geconfigureerde build
 * (lokaal, zonder CMS) is wél deterministisch en dus gratis te cachen.
 *
 * `loadNavigation()` kent geen locale-parameter — de labels worden downstream
 * vertaald via `ui.t('nav.<key>')` (zie `ui-strings.ts`), dus één cache-slot
 * volstaat, waar `loadUiStrings()` er per locale één nodig had.
 */
let navigationCache: Promise<NavItem[]> | null = null;

export function loadNavigation(): Promise<NavItem[]> {
    const pending = (navigationCache ??= fetchNavigation().then(
        ({ items, cacheable }) => {
            // Terugval op FALLBACK_ITEMS na een lege read = geen geldige cache-inhoud.
            if (!cacheable) navigationCache = null;
            return items;
        },
        (err) => {
            navigationCache = null;
            throw err;
        },
    ));
    // Elke aanroep kreeg vóór deze cache zijn eigen array terug; die isolatie
    // houden we vast zodat een caller die sorteert/pusht niet de cache sloopt.
    return pending.then((items) => [...items]);
}

/** Resultaat + of het de moeite waard is om het de hele build vast te houden. */
interface NavigationLoad {
    items: NavItem[];
    /** `false` zodra we ná een Directus-read op FALLBACK_ITEMS zijn teruggevallen. */
    cacheable: boolean;
}

async function fetchNavigation(): Promise<NavigationLoad> {
    const env = readDirectusEnv();

    // Lokale/dev-build zonder CMS: gebruik de fallback zodat de header blijft
    // renderen. In prod is Directus altijd geconfigureerd, dus dit pad is de
    // uitzondering, niet de norm.
    if (!env.configured) {
        console.warn('[loadNavigation] Directus not configured — using fallback nav');
        // Deterministisch (env verandert niet tijdens een build): niets om
        // opnieuw te proberen, dus cachen is hier gratis en juist.
        return { items: sorted(FALLBACK_ITEMS), cacheable: true };
    }

    const fields = 'label,href,key,order,status';
    const url = `${env.url}/items/nav_items?limit=-1&fields=${fields}${statusFilterQuery(env)}&sort=order`;
    const res = await fetchDirectusCollection('loadNavigation', url, {
        headers: { Authorization: `Bearer ${env.token}` },
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
        return { items: sorted(FALLBACK_ITEMS), cacheable: false };
    }

    console.log(`[loadNavigation] loaded ${items.length} nav_items from Directus`);
    return { items: sorted(items), cacheable: true };
}
