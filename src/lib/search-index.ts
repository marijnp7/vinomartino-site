import { loadArticles } from './articles';
import { loadStreken } from './streken';
import { loadWijnhuizen } from './wijnhuizen';
import { loadRoutes } from './routes';
import { loadLanden } from './landen';
import { DEFAULT_LOCALE, localizePath, type Locale } from './i18n';

// LAT-1202 / LAT-2781: gedeelde build-time search-index-generator. Eén flat JSON
// document per locale dat de client-side SearchDialog ophaalt en lokaal scoort.
// Statisch, cacheable, geen runtime-dependency — past in de Directus->build->VPS
// pipeline.
//
// LAT-2781 — per-locale: elke loader krijgt de `locale` mee zodat de
// no-translation-guard (directus-i18n.ts) onvertaalde records eruit filtert. De
// EN-index bevat dus alléén vertaalde content en `url` is server-side al
// gelokaliseerd (localizePath), zodat de client geen paden hoeft samen te
// stellen — geen NL-titels of 404's meer voor een EN-bezoeker.

export interface SearchRecord {
    type: 'Artikel' | 'Land' | 'Streek' | 'Wijnhuis' | 'Wijnroute';
    title: string;
    subtitle: string;
    url: string;
    excerpt: string;
    keywords: string[];
    body: string;
}

// Locale-afhankelijke fallback-subtitels (alleen zichtbaar als de databron leeg
// is; de content-subtitels zelf komen uit de per-locale loaders).
const SUBTITLE_FALLBACKS: Record<Locale, { artikel: string; land: string; streek: string; wijnhuis: string; route: string }> = {
    nl: { artikel: 'Artikel', land: 'Wijnland', streek: 'Wijnstreek', wijnhuis: 'Wijnhuis', route: 'Wijnroute' },
    en: { artikel: 'Article', land: 'Wine country', streek: 'Wine region', wijnhuis: 'Winery', route: 'Wine route' },
};

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function excerpt(text: string, max = 160): string {
    const clean = stripHtml(text);
    if (clean.length <= max) return clean;
    return clean.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function bodyText(html: string, max = 600): string {
    const clean = stripHtml(html);
    return clean.length <= max ? clean : clean.slice(0, max);
}

function clean(list: (string | null | undefined)[]): string[] {
    return list.filter((v): v is string => Boolean(v && String(v).trim())).map((v) => String(v).trim());
}

/**
 * Bouw de search-records voor een locale. NL blijft byte-identiek aan de oude
 * inline-generator (`localizePath(..., 'nl')` = kale pad, ongewijzigd). Voor EN
 * levert elke loader alléén vertaalde records en wordt `url` naar `/en/...`
 * geprefixt.
 */
export async function buildSearchRecords(locale: Locale = DEFAULT_LOCALE): Promise<SearchRecord[]> {
    const [articles, landen, streken, wijnhuizen, routes] = await Promise.all([
        loadArticles(locale),
        loadLanden(locale),
        loadStreken(locale),
        loadWijnhuizen(locale),
        loadRoutes(locale),
    ]);

    const fb = SUBTITLE_FALLBACKS[locale] ?? SUBTITLE_FALLBACKS[DEFAULT_LOCALE];
    const url = (path: string) => localizePath(path, locale);
    const records: SearchRecord[] = [];

    for (const a of articles) {
        records.push({
            type: 'Artikel',
            title: a.title,
            subtitle: a.category || fb.artikel,
            url: url(`/artikelen/${a.slug}/`),
            excerpt: a.description || excerpt(a.bodyHtml),
            keywords: clean([a.category, a.author, ...(a.tags || [])]),
            body: bodyText(a.bodyHtml),
        });
    }

    for (const l of landen) {
        records.push({
            type: 'Land',
            title: l.name,
            subtitle: clean([l.continent]).join(' · ') || fb.land,
            url: url(`/landen/${l.slug}/`),
            excerpt: l.description || excerpt(l.bodyHtml),
            keywords: clean([l.continent, l.capital, ...(l.mainGrapes || []), ...(l.wijnstreken || []).map((w) => w.name)]),
            body: bodyText(l.bodyHtml),
        });
    }

    for (const s of streken) {
        records.push({
            type: 'Streek',
            title: s.name,
            subtitle: clean([s.country]).join(' · ') || fb.streek,
            url: url(`/streken/${s.slug}/`),
            excerpt: s.description || excerpt(s.bodyHtml),
            keywords: clean([s.country, ...(s.mainGrapes || []), ...(s.appellations || []), ...(s.subRegions || [])]),
            body: bodyText(s.bodyHtml),
        });
    }

    for (const w of wijnhuizen) {
        records.push({
            type: 'Wijnhuis',
            title: w.name,
            subtitle: clean([w.region, w.country]).join(' · ') || fb.wijnhuis,
            url: url(`/wijnhuizen/${w.slug}/`),
            excerpt: w.description || excerpt(w.bodyHtml),
            keywords: clean([w.region, w.country, w.winemaker, ...(w.grapes || [])]),
            body: bodyText(w.bodyHtml),
        });
    }

    for (const r of routes) {
        records.push({
            type: 'Wijnroute',
            title: r.title,
            subtitle: clean([r.style, r.duration]).join(' · ') || fb.route,
            url: url(`/wijnroutes/${r.slug}/`),
            excerpt: r.description || excerpt(r.bodyHtml),
            keywords: clean([r.style, r.transport, ...(r.highlights || []), ...(r.stops || [])]),
            body: bodyText(r.bodyHtml),
        });
    }

    return records;
}

/** Serialiseer de index-response (gedeeld door de NL- en EN-endpoints). */
export function searchIndexResponse(records: SearchRecord[]): Response {
    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), count: records.length, records }), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
