import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { getPinPlan } from '../../../lib/pin-plan';

// LAT-11988: pinbeeld per pagina, 1000x1500 (eigen foto plus tekstvlak).
export async function getStaticPaths() {
    const plan = await getPinPlan();
    const seen = new Set<string>();
    const paths: { params: { lang: string; slug: string } }[] = [];
    for (const it of plan.items) {
        const k = `${it.lang}/${it.slug}`;
        if (seen.has(k)) continue;
        seen.add(k);
        paths.push({ params: { lang: it.lang, slug: it.slug } });
    }
    return paths;
}

export const GET: APIRoute = async ({ params }) => {
    const plan = await getPinPlan();
    const file = plan.files.get(`${params.lang}/${params.slug}`);
    if (!file) return new Response('not found', { status: 404 });
    return new Response(readFileSync(file), { headers: { 'Content-Type': 'image/jpeg' } });
};
