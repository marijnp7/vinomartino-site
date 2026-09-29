/**
 * LAT-11988: bouwt het pinplan (welke pagina's, welke dagen) en rendert de
 * pinbeelden. Eén keer per build (memo); `pins.xml.ts` en de beeldroute delen
 * het resultaat.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadArticles } from './articles';
import { creditRequiredForAsset } from './hero-credit-guard';
import { getImageCredit } from './image-credits';
import { isSyntheticImage, loadSyntheticImageIds } from './synthetic-images';
import {
    PINS_PER_WEEKDAY,
    clusterOf,
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
    const rotation = interleaveByCluster(candidates);
    const chosen = days.flatMap((d) => selectForWeekday(rotation, d, PINS_PER_WEEKDAY).map((c) => ({ c, d })));

    const files = new Map<string, string>();
    const sizes = renderAll(chosen.map((x) => x.c));
    for (const [k, v] of sizes) files.set(k, v.file);

    const items: PinItem[] = chosen.map(({ c, d }) => ({
        lang: c.lang,
        slug: c.slug,
        clusterId: c.clusterId,
        title: c.title,
        description: c.description,
        link: pinUrl(c.lang, c.slug),
        image: pinImageUrl(c.lang, c.slug),
        imageBytes: sizes.get(key(c.lang, c.slug))?.bytes ?? 0,
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
