import { DEFAULT_LOCALE, type Locale } from './i18n';
import { loadArticles } from './articles';
import { loadStreken } from './streken';
import { loadWijnhuizen } from './wijnhuizen';
import { loadRoutes } from './routes';
import { loadLanden, loadLandenNav } from './landen';
import { loadUiStrings } from './ui-strings';
import { rubriekLabel } from './rubriek-labels';
import { localizeContinent } from './route-labels';

// LAT-1202: build-time search index. Emits one flat JSON document that the
// client-side SearchDialog fetches once and scores locally. Static, cacheable,
// no runtime/server dependency — fits the Directus->build->VPS pipeline.
// LAT-12594: per locale. /search-index.json (NL) en /en/search-index.json (EN)
// komen uit dezelfde bouwer; EN gebruikt dezelfde loaders als de /en/-pagina's,
// dus elke EN-hit wijst naar een pagina die bestaat. `type` blijft de vaste
// sleutel; de dialoog vertaalt hem.

export interface SearchRecord {
    type: 'Artikel' | 'Land' | 'Streek' | 'Wijnhuis' | 'Wijnroute';
    title: string;
    subtitle: string;
    url: string;
    excerpt: string;
    keywords: string[];
    body: string;
}

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

export async function buildSearchIndex(locale: Locale = DEFAULT_LOCALE) {
    const isEn = locale === 'en';
    const p = isEn ? '/en' : '';
    const [articles, landen, streken, wijnhuizen, routes] = await Promise.all([
        loadArticles(locale),
        loadLanden(locale),
        loadStreken(locale),
        loadWijnhuizen(locale),
        loadRoutes(locale),
    ]);

    // LAT-13075 (H3): artikeltags zijn een NL-woordenlijst zonder EN-vertaling in het CMS.
    // Een tag die exact een NL-landnaam is, wordt in de EN-index de EN-landnaam (zelfde slug).
    // De bron blijft ongewijzigd; overige tags blijven letterlijk staan.
    const landTag = new Map<string, string>();
    if (isEn) {
        const nlLanden = await loadLandenNav('nl');
        const enBySlug = new Map(landen.map((l) => [l.slug, l.name]));
        for (const l of nlLanden) {
            const en = enBySlug.get(l.slug);
            if (l.name && en && en !== l.name) landTag.set(l.name.toLowerCase(), en);
        }
    }
    const localizeTag = (t: string) => landTag.get(String(t).trim().toLowerCase()) ?? t;

    const records: SearchRecord[] = [];

    // LAT-3306: rubrieklabel via de UI-dictionary, per locale.
    const ui = await loadUiStrings(locale);

    for (const a of articles) {
        const rubriek = rubriekLabel(ui, a.category);
        records.push({
            type: 'Artikel',
            title: a.title,
            subtitle: rubriek || (isEn ? 'Article' : 'Artikel'),
            url: `${p}/artikelen/${a.slug}/`,
            excerpt: a.description || excerpt(a.bodyHtml),
            keywords: clean([rubriek, a.author, ...(a.tags || []).map(localizeTag)]),
            body: bodyText(a.bodyHtml),
        });
    }

    for (const l of landen) {
        records.push({
            type: 'Land',
            title: l.name,
            subtitle: clean([localizeContinent(l.continent, locale, (k) => ui.t(k))]).join(' · ') || (isEn ? 'Wine country' : 'Wijnland'),
            url: `${p}/landen/${l.slug}/`,
            excerpt: l.description || excerpt(l.bodyHtml),
            keywords: clean([localizeContinent(l.continent, locale, (k) => ui.t(k)), l.capital, ...(l.mainGrapes || []), ...(l.wijnstreken || []).map((w) => w.name)]),
            body: bodyText(l.bodyHtml),
        });
    }

    for (const s of streken) {
        records.push({
            type: 'Streek',
            title: s.name,
            subtitle: clean([s.country]).join(' · ') || (isEn ? 'Wine region' : 'Wijnstreek'),
            url: `${p}/streken/${s.slug}/`,
            excerpt: s.description || excerpt(s.bodyHtml),
            keywords: clean([s.country, ...(s.mainGrapes || []), ...(s.appellations || []), ...(s.subRegions || [])]),
            body: bodyText(s.bodyHtml),
        });
    }

    for (const w of wijnhuizen) {
        records.push({
            type: 'Wijnhuis',
            title: w.name,
            subtitle: clean([w.region, w.country]).join(' · ') || (isEn ? 'Winery' : 'Wijnhuis'),
            url: `${p}/wijnhuizen/${w.slug}/`,
            excerpt: w.description || excerpt(w.bodyHtml),
            keywords: clean([w.region, w.country, w.winemaker, ...(w.grapes || [])]),
            body: bodyText(w.bodyHtml),
        });
    }

    for (const r of routes) {
        records.push({
            type: 'Wijnroute',
            title: r.title,
            subtitle: clean([r.style, r.duration]).join(' · ') || (isEn ? 'Wine route' : 'Wijnroute'),
            url: `${p}/wijnroutes/${r.slug}/`,
            excerpt: r.description || excerpt(r.bodyHtml),
            keywords: clean([r.style, r.transport, ...(r.highlights || []), ...(r.stops || [])]),
            body: bodyText(r.bodyHtml),
        });
    }

    return { generatedAt: new Date().toISOString(), count: records.length, records };
}

export function searchIndexResponse(index: Awaited<ReturnType<typeof buildSearchIndex>>): Response {
    return new Response(JSON.stringify(index), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
