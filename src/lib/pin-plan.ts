/**
 * LAT-11988: bouwt het pinplan (welke pagina's, welke dagen) en rendert de
 * pinbeelden. Eén keer per build (memo); `pins.xml.ts` en de beeldroute delen
 * het resultaat.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { join } from 'node:path';
import { loadArticles, type Article } from './articles';
import { damAssetUrl, readDirectusEnv, withAssetSlot } from './directus-config';
import { creditRequiredForAsset } from './hero-credit-guard';
import { getImageCredit } from './image-credits';
import { isSyntheticImage, loadSyntheticImageIds } from './synthetic-images';
import {
    PINS_PER_WEEKDAY,
    PIN_DAM_BATCHES,
    PIN_DAM_SLUGS,
    clusterOf,
    composeDay,
    interleaveByCluster,
    lastWeekdays,
    lintText,
    pinImageUrl,
    pinUrl,
    selectForWeekday,
    truncateAtWord,
    type PinItem,
    type PinLang,
    type PinSource,
} from './pins';

interface Candidate {
    lang: PinLang;
    slug: string;
    clusterId: string;
    title: string;
    description: string;
    heroPath: string;
    dam?: { file: string; bytes: number };
}

export interface PinPlan {
    items: PinItem[];
    files: Map<string, string>;
    stats: { candidates: number; skipped: Record<string, number>; days: string[] };
}

const key = (lang: PinLang, slug: string) => `${lang}/${slug}`;
let memo: Promise<PinPlan> | null = null;

export function getPinPlan(): Promise<PinPlan> {
    memo ??= buildPlan();
    return memo;
}

async function buildPlan(): Promise<PinPlan> {
    const skipped: Record<string, number> = {};
    const skip = (why: string) => {
        skipped[why] = (skipped[why] ?? 0) + 1;
    };
    const [nl, en, synthetic] = await Promise.all([
        loadArticles(),
        loadArticles('en'),
        loadSyntheticImageIds(),
    ]);
    const candidates: Candidate[] = [];
    for (const [articles, locale] of [[nl, 'nl'], [en, 'en']] as const) {
        for (const a of articles) {
            if (PIN_DAM_SLUGS.has(a.slug)) continue;
            const src: PinSource = {
                slug: a.slug,
                title: a.title,
                description: a.description,
                category: a.category,
                tags: a.tags,
                streken: a.relatedStreken,
            };
            const cluster = clusterOf(src);
            if (!cluster || cluster.lang !== locale) continue;
            const description = truncateAtWord(a.description || a.metaDescription || '', 480);
            const title = truncateAtWord(a.title, 95);
            if (!title || !description) { skip('geen titel of omschrijving'); continue; }
            if (!a.heroImage || !existsSync(join(process.cwd(), 'public', a.heroImage))) { skip('geen eigen foto'); continue; }
            if (a.heroIsIllustration || isSyntheticImage(synthetic, a.heroImageId, a.heroImage)) { skip('illustratie of synthetisch'); continue; }
            if (getImageCredit(a.heroImageId) || creditRequiredForAsset(a.heroImageId)) { skip('foto van derden'); continue; }
            const hits = lintText(`${a.title}\n${description}`);
            if (hits.length) {
                skip(`lint ${hits[0].rule}`);
                console.warn(`[pins] ${locale}/${a.slug} uit de feed, lint: ${hits.map((h) => h.rule).join(',')}`);
                continue;
            }
            candidates.push({ lang: locale, slug: a.slug, clusterId: cluster.id, title, description, heroPath: join(process.cwd(), 'public', a.heroImage) });
        }
    }

    const days = lastWeekdays(new Date());
    const dam = await buildDamPins({ nl, en }, synthetic, skip);
    const rotation = interleaveByCluster(candidates);
    const chosen = days.flatMap((d) => {
        const day = d.toISOString().slice(0, 10);
        const damToday = dam.filter((x) => x.day === day).map((x) => x.pin);
        const rot = selectForWeekday(rotation, d, PINS_PER_WEEKDAY);
        return composeDay<Candidate>(damToday, rot, PINS_PER_WEEKDAY).map((c) => ({ c, d }));
    });

    const files = new Map<string, string>();
    const sizes = renderAll(chosen.filter((x) => !x.c.dam).map((x) => x.c));
    for (const [k, v] of sizes) files.set(k, v.file);
    for (const { c } of chosen) if (c.dam) files.set(key(c.lang, c.slug), c.dam.file);

    const items: PinItem[] = chosen.map(({ c, d }) => ({
        lang: c.lang,
        slug: c.slug,
        clusterId: c.clusterId,
        title: c.title,
        description: c.description,
        link: pinUrl(c.lang, c.slug),
        image: pinImageUrl(c.lang, c.slug, c.dam ? 'png' : 'jpg'),
        imageBytes: c.dam ? c.dam.bytes : (sizes.get(key(c.lang, c.slug))?.bytes ?? 0),
        ...(c.dam ? { imageMime: 'image/png' } : {}),
        date: d,
    }));
    console.log(`[pins] ${candidates.length} kandidaten, ${items.length} items over ${days.length} werkdagen`, skipped);
    return { items, files, stats: { candidates: candidates.length, skipped, days: days.map((d) => d.toISOString().slice(0, 10)) } };
}

function renderAll(cands: Candidate[]): Map<string, { file: string; bytes: number }> {
    const unique = [...new Map(cands.map((c) => [key(c.lang, c.slug), c])).values()];
    const out = new Map<string, { file: string; bytes: number }>();
    if (unique.length === 0) return out;
    const dir = mkdtempSync(join(tmpdir(), 'vm-pins-'));
    mkdirSync(join(dir, 'cache'), { recursive: true });
    const fontDir = join(process.cwd(), 'src', 'assets', 'pin-fonts');
    const conf = join(dir, 'fonts.conf');
    writeFileSync(
        conf,
        `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>${fontDir}</dir><cachedir>${join(dir, 'cache')}</cachedir></fontconfig>\n`,
    );
    const jobs = unique.map((c) => ({ src: c.heroPath, out: join(dir, `${c.lang}-${c.slug}.jpg`), title: c.title }));
    const jobsFile = join(dir, 'jobs.json');
    writeFileSync(jobsFile, JSON.stringify(jobs));
    execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'pin-render.mjs'), jobsFile], {
        env: { ...process.env, FONTCONFIG_FILE: conf, FONTCONFIG_PATH: dir },
        stdio: ['ignore', 'inherit', 'inherit'],
    });
    const sizes = JSON.parse(readFileSync(jobsFile + '.sizes.json', 'utf8')) as Record<string, number>;
    unique.forEach((c, i) => out.set(key(c.lang, c.slug), { file: jobs[i].out, bytes: sizes[jobs[i].out] }));
    return out;
}

/**
 * LAT-12109: haalt de goedgekeurde DAM-pins op. Een pin die niet aan alle eisen
 * voldoet (pagina gepubliceerd, lint schoon, bestand synthetisch met disclosure,
 * 1000x1500) blijft uit de feed en staat in `skipped`; de build breekt er niet op.
 */
async function buildDamPins(
    articles: { nl: Article[]; en: Article[] },
    synthetic: ReadonlySet<string>,
    skip: (why: string) => void,
): Promise<{ day: string; pin: Candidate }[]> {
    const out: { day: string; pin: Candidate }[] = [];
    const env = readDirectusEnv();
    const dir = mkdtempSync(join(tmpdir(), 'vm-pins-dam-'));
    for (const batch of PIN_DAM_BATCHES) {
        for (const p of batch.pins) {
            const tag = `[pins] DAM ${p.articleId} ${p.lang}/${p.slug}`;
            const a = articles[p.lang].find((x) => x.slug === p.slug);
            if (!a) { skip('dam: pagina niet gepubliceerd'); console.warn(`${tag} uit de feed: geen gepubliceerde ${p.lang}-pagina`); continue; }
            const description = truncateAtWord(a.description || a.metaDescription || '', 480);
            const title = truncateAtWord(a.title, 95);
            const hits = lintText(`${a.title}\n${description}`);
            if (!title || !description || hits.length) { skip('dam: titel, omschrijving of lint'); console.warn(`${tag} uit de feed: ${hits.map((h) => h.rule).join(',') || 'leeg'}`); continue; }
            if (!synthetic.has(p.fileId)) { skip('dam: bestand niet als synthetisch herkend'); console.warn(`${tag} uit de feed: ${p.fileId} is niet synthetisch gemarkeerd`); continue; }
            if (!env.configured) { skip('dam: geen Directus'); console.warn(`${tag} uit de feed: Directus niet geconfigureerd`); continue; }
            try {
                const buf = await withAssetSlot(async () => {
                    // LAT-12116: damAssetUrl, NIET assetUrl. Zie de toelichting daar:
                    // de hero-transform schaalt deze pin op naar jpeg 1600x2400 en de
                    // formaatcheck hieronder keurde hem dan af.
                    const res = await fetch(damAssetUrl(env.url, p.fileId), {
                        headers: { Authorization: `Bearer ${env.token}` },
                        signal: AbortSignal.timeout(20000),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return Buffer.from(await res.arrayBuffer());
                });
                const meta = await sharp(buf).metadata();
                if (meta.format !== 'png' || meta.width !== 1000 || meta.height !== 1500) {
                    skip('dam: verkeerd formaat');
                    console.warn(`${tag} uit de feed: ${meta.format} ${meta.width}x${meta.height}, verwacht png 1000x1500`);
                    continue;
                }
                const file = join(dir, `${p.lang}-${p.slug}.png`);
                writeFileSync(file, buf);
                out.push({
                    day: batch.day,
                    pin: { lang: p.lang, slug: p.slug, clusterId: 'dam', title, description, heroPath: '', dam: { file, bytes: buf.length } },
                });
            } catch (err) {
                skip('dam: download mislukt');
                console.warn(`${tag} uit de feed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    return out;
}
