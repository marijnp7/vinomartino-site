import type { APIRoute } from 'astro';
import { loadArticles } from '../lib/articles';
import { loadStreken } from '../lib/streken';
import { loadWijnhuizen } from '../lib/wijnhuizen';
import { loadRoutes } from '../lib/routes';
import { loadLanden } from '../lib/landen';

// LAT-1202: build-time search index. Emits one flat JSON document that the
// client-side SearchDialog fetches once and scores locally. Static, cacheable,
// no runtime/server dependency — fits the Directus->build->VPS pipeline.

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

export const GET: APIRoute = async () => {
    const [articles, landen, streken, wijnhuizen, routes] = await Promise.all([
        loadArticles(),
        loadLanden(),
        loadStreken(),
        loadWijnhuizen(),
        loadRoutes(),
    ]);

    const records: SearchRecord[] = [];

    for (const a of articles) {
        records.push({
            type: 'Artikel',
            title: a.title,
            subtitle: a.category || 'Artikel',
            url: `/artikelen/${a.slug}/`,
            excerpt: a.description || excerpt(a.bodyHtml),
            keywords: clean([a.category, a.author, ...(a.tags || [])]),
            body: bodyText(a.bodyHtml),
        });
    }

    for (const l of landen) {
        records.push({
            type: 'Land',
            title: l.name,
            subtitle: clean([l.continent]).join(' · ') || 'Wijnland',
            url: `/landen/${l.slug}/`,
            excerpt: l.description || excerpt(l.bodyHtml),
            keywords: clean([l.continent, l.capital, ...(l.mainGrapes || []), ...(l.wijnstreken || []).map((w) => w.name)]),
            body: bodyText(l.bodyHtml),
        });
    }

    for (const s of streken) {
        records.push({
            type: 'Streek',
            title: s.name,
            subtitle: clean([s.country]).join(' · ') || 'Wijnstreek',
            url: `/streken/${s.slug}/`,
            excerpt: s.description || excerpt(s.bodyHtml),
            keywords: clean([s.country, ...(s.mainGrapes || []), ...(s.appellations || []), ...(s.subRegions || [])]),
            body: bodyText(s.bodyHtml),
        });
    }

    for (const w of wijnhuizen) {
        records.push({
            type: 'Wijnhuis',
            title: w.name,
            subtitle: clean([w.region, w.country]).join(' · ') || 'Wijnhuis',
            url: `/wijnhuizen/${w.slug}/`,
            excerpt: w.description || excerpt(w.bodyHtml),
            keywords: clean([w.region, w.country, w.winemaker, ...(w.grapes || [])]),
            body: bodyText(w.bodyHtml),
        });
    }

    for (const r of routes) {
        records.push({
            type: 'Wijnroute',
            title: r.title,
            subtitle: clean([r.style, r.duration]).join(' · ') || 'Wijnroute',
            url: `/wijnroutes/${r.slug}/`,
            excerpt: r.description || excerpt(r.bodyHtml),
            keywords: clean([r.style, r.transport, ...(r.highlights || []), ...(r.stops || [])]),
            body: bodyText(r.bodyHtml),
        });
    }

    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), count: records.length, records }), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
};
