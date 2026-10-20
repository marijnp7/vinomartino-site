// Pilot scope is explicit; hotel content and selection remain in Directus.
export const PILOT_STAY_REGIONS = new Set(['champagne', 'toscane-italie', 'bourgogne']);
export const PILOT_STAY_ROUTES = new Set(['bourgogne-cote-dor-villages', 'toscane-bolgheri-montalcino-carmignano', 'champagne-reims-epernay-montagne-de-reims', 'toscane-chianti-montalcino-bolgheri-vier-dagen']);
type Row = Record<string, any>;
export function isRouteOnly(row: Row): boolean {
    return Array.isArray(row.tags) && row.tags.includes('route_only');
}
export function canonicalRegionStays(rows: Row[], slug: string): Row[] {
    const selected = rows.filter(r => r.streek_id?.slug === slug && !isRouteOnly(r));
    if (selected.length !== 9) throw new Error(`Canonical stays ${slug}: expected 9, got ${selected.length}`);
    for (const tier of ['slim_geboekt', 'prijs_kwaliteit', 'pure_luxe']) {
        if (selected.filter(r => r.tier === tier).length !== 3) throw new Error(`Canonical stays ${slug}: expected 3 in ${tier}`);
    }
    return selected;
}
export function toRegionStay(row: Row): Row {
    return { naam: row.name, tier: row.tier, why_this_one: row.why_this_one || row.description,
        prijs_laag: row.price_low, prijs_hoog: row.price_high, prijs_valuta: row.prijs_valuta,
        lat: row.lat, lng: row.lng, boeklink: row.booking_url, adres: row.location,
        rating: row.recensiescore, hero_image: row.hero_image };
}
export function hydrateRouteStays(itinerary: unknown, rows: Row[], requireIds = false): unknown {
    if (!itinerary || typeof itinerary !== 'object') return itinerary;
    const result = structuredClone(itinerary) as Row;
    const byId = new Map(rows.map(r => [String(r.id), r]));
    function hydrate(stay: Row | undefined) {
        if (!stay) return;
        if (stay.accommodation_id == null) {
            if (requireIds) throw new Error(`Missing accommodation_id: ${stay.naam || stay.name}`);
            return;
        }
        const record = byId.get(String(stay.accommodation_id));
        if (!record) throw new Error(`Unavailable accommodation_id: ${stay.accommodation_id}`);
        const url = new URL(record.booking_url);
        if (url.protocol !== 'https:' || !/^(www\.)?booking\.com$/.test(url.hostname) || !url.pathname.startsWith('/hotel/') || url.search) {
            throw new Error(`Accommodation ${record.id} needs a direct hotel URL`);
        }
        // Route-specific why/label/plaats stay editorial; shared hotel facts come from the record.
        Object.assign(stay, { naam: record.name, slug: record.slug, booking_url: record.booking_url,
            lat: record.lat, lng: record.lng, foto: record.hero_image, boekbaar: true });
    }
    for (const day of result.days || []) hydrate(day.overnachting);
    for (const day of result.pagina?.dagen || []) hydrate(day.slaap);
    for (const stay of result.pagina?.slapen?.items || []) hydrate(stay);
    return result;
}
