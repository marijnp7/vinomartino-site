export interface NavItem {
    label: string;
    href: string;
    key: string;
    order: number;
}

const FALLBACK_ITEMS: NavItem[] = [
    { label: 'Landen', href: '/landen/', key: 'landen', order: 10 },
    { label: 'Streken', href: '/streken/', key: 'streken', order: 20 },
    { label: 'Wijnhuizen', href: '/wijnhuizen/', key: 'wijnhuizen', order: 30 },
    { label: 'Wijnroutes', href: '/wijnroutes/', key: 'wijnroutes', order: 40 },
    { label: 'Artikelen', href: '/artikelen/', key: 'artikelen', order: 50 },
    { label: 'De Brief', href: '/de-brief/', key: 'de-brief', order: 60 },
    { label: 'Over ons', href: '/over-ons/', key: 'over-ons', order: 70 },
];

function getDirectusConfig() {
    const url = process.env['DIRECTUS_URL'] || '';
    const token = process.env['DIRECTUS_TOKEN'] || '';
    return { url, token };
}

function mapItem(r: Record<string, unknown>): NavItem | null {
    const label = String(r.label || '').trim();
    const href = String(r.href || '').trim();
    const key = String(r.key || '').trim();
    if (!label || !href || !key) return null;
    const orderRaw = r.order;
    const order = typeof orderRaw === 'number' ? orderRaw : Number(orderRaw) || 0;
    return { label, href, key, order };
}

async function loadFromDirectus(url: string, token: string): Promise<NavItem[]> {
    let res: Response;
    try {
        res = await fetch(
            `${url}/items/nav_items?limit=-1&fields=label,href,key,order,status&filter[status][_eq]=published&sort=order`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000),
            },
        );
    } catch (err) {
        console.warn(`[loadNavigation] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    if (!res.ok) {
        console.warn(`[loadNavigation] Directus returned ${res.status} ${res.statusText}`);
        return [];
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    const items = data.map(mapItem).filter((x): x is NavItem => x !== null);
    items.sort((a, b) => a.order - b.order);
    console.log(`[loadNavigation] fetched ${items.length} items from Directus`);
    return items;
}

export async function loadNavigation(): Promise<NavItem[]> {
    const { url, token } = getDirectusConfig();
    if (url && token) {
        const items = await loadFromDirectus(url, token);
        if (items.length > 0) return items;
        console.warn(`[loadNavigation] Directus returned no items — using fallback`);
    } else {
        console.warn(`[loadNavigation] Directus not configured — using fallback`);
    }
    return [...FALLBACK_ITEMS].sort((a, b) => a.order - b.order);
}
