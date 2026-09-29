import type { APIRoute } from 'astro';
import { getPinPlan } from '../lib/pin-plan';
import { feedTexts, lintText, renderFeed } from '../lib/pins';

// LAT-11988: Pinterest-RSS-feed. Elke werkdag vijf gepubliceerde clusterpagina's
// in vaste rotatie; de feed toont de laatste vijf werkdagen (25 items).
export const GET: APIRoute = async () => {
    const plan = await getPinPlan();
    const xml = renderFeed(plan.items, new Date());
    const hits = feedTexts(xml).flatMap((t) => lintText(t));
    if (hits.length) {
        throw new Error(`[pins] lint op de feed: ${hits.map((h) => `${h.rule}:${h.match}`).join(', ')}`);
    }
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
