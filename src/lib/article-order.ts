// LAT-14828 — volgorde en "verhaal van de week" op pub_date, zonder verzonnen datums.
//
// Vier artikelen zonder pub_date stonden wekenlang bovenaan homepage, feed en overzicht:
// Directus' `sort=-pub_date` zet NULL bovenaan en de loader verzon er een datum bij
// (stableFallbackPubDate, LAT-2358). Deze module is puur (geen Directus, geen Astro) zodat
// scripts/lat14828-pubdate-order.test.mjs hem rechtstreeks kan toetsen.

export interface DatedLike {
    slug: string;
    pubDate: string;
    updatedAt: string | null;
    featured: boolean;
}

/** Een featured-vinkje dat langer dan dit niet is bijgewerkt, telt niet meer. */
export const FEATURED_MAX_AGE_DAYS = 14;

function ts(value: string | null | undefined): number {
    if (!value) return NaN;
    return Date.parse(value);
}

export function hasPubDate(a: Pick<DatedLike, 'pubDate'>): boolean {
    return Number.isFinite(ts(a.pubDate));
}

/**
 * Nieuwste pub_date eerst; artikelen zonder (geldige) pub_date altijd onderaan, in hun
 * bronvolgorde. Stabiel, muteert de invoer niet.
 */
export function sortByPubDateNullsLast<T extends Pick<DatedLike, 'pubDate'>>(articles: readonly T[]): T[] {
    return articles
        .map((a, i) => ({ a, i, t: ts(a.pubDate) }))
        .sort((x, y) => {
            const xf = Number.isFinite(x.t);
            const yf = Number.isFinite(y.t);
            if (xf && yf && x.t !== y.t) return y.t - x.t;
            if (xf !== yf) return xf ? -1 : 1;
            return x.i - y.i;
        })
        .map((x) => x.a);
}

/** Slugs zonder pub_date, voor de luide build-waarschuwing. */
export function slugsWithoutPubDate(articles: readonly Pick<DatedLike, 'slug' | 'pubDate'>[]): string[] {
    return articles.filter((a) => !hasPubDate(a)).map((a) => a.slug);
}

/**
 * Het "verhaal van de week": het nieuwste gepubliceerde artikel, tenzij er een featured
 * artikel is dat in de laatste FEATURED_MAX_AGE_DAYS is bijgewerkt (updatedAt, anders
 * pubDate). Een vergeten vinkje bevriest de homepage dus hooguit twee weken.
 * Artikelen zonder pub_date komen nooit in aanmerking.
 */
export function pickSpotlight<T extends DatedLike>(articles: readonly T[], now: Date = new Date()): T | undefined {
    const dated = sortByPubDateNullsLast(articles.filter(hasPubDate));
    const cutoff = now.getTime() - FEATURED_MAX_AGE_DAYS * 86400000;
    const freshFeatured = dated.find((a) => {
        if (!a.featured) return false;
        const touched = Math.max(ts(a.updatedAt) || -Infinity, ts(a.pubDate));
        return touched >= cutoff;
    });
    return freshFeatured ?? dated[0];
}
