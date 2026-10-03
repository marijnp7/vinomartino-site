#!/usr/bin/env node
// scripts/optimize-images.mjs — LAT-12054 deel 3
//
// Post-build stap op dist/: lichtere beelden via <picture> (AVIF + WebP met JPG-
// fallback, srcset 640/1024/1600 + sizes), fetchpriority=high op de hero en
// loading=lazy op de rest.
//
// 1. Elk dist/images/**/*.jpg en dist/over-ons-hero.jpg krijgt varianten
//    `<naam>.w640.{avif,webp,jpg}`, `.w1024.*`, `.w1600.*` (nooit breder dan de
//    bron; nooit upscalen). Het basis-.jpg wordt vervangen door een versie <= 400 KB.
// 2. Elke <img src="….jpg"> in dist/**/*.html met varianten wordt in <picture>
//    gewikkeld. Dat gebeurt op de HTML en niet in de ~20 templates, zodat ook
//    kaarten, markdown-body en toekomstige templates meekomen.
//
// Varianten worden gecachet op de sha1 van de bron (IMAGE_VARIANT_CACHE, default
// node_modules/.cache/vm-image-variants), zodat een herbouw zonder nieuwe beelden
// geen honderden AVIF-encodes herhaalt.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const WIDTHS = [640, 1024, 1600];
export const MAX_BYTES = 400 * 1024;
const QUALITIES = { jpg: [78, 70, 62, 54, 46, 42, 38, 34], webp: [74, 66, 58, 50, 42, 36, 30, 24, 18, 12], avif: [50, 44, 38, 32, 26] };

function walk(dir, pred, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, pred, out);
        else if (pred(p)) out.push(p);
    }
    return out;
}

const isVariantName = (p) => /\.w\d+\.(avif|webp|jpg)$/i.test(p);

/** Breedtes die voor een bron van `srcW` breed bestaan (nooit upscalen). */
export function widthsFor(srcW) {
    const ws = WIDTHS.filter((w) => w <= srcW);
    const top = Math.min(srcW, WIDTHS[WIDTHS.length - 1]);
    if (!ws.includes(top)) ws.push(top);
    return ws.sort((a, b) => a - b);
}

async function encode(pipeline, fmt) {
    let last;
    for (const q of QUALITIES[fmt]) {
        const p = pipeline.clone();
        if (fmt === 'jpg') p.jpeg({ quality: q, mozjpeg: true });
        else if (fmt === 'webp') p.webp({ quality: q });
        else p.avif({ quality: q, effort: 2 });
        last = await p.toBuffer();
        if (last.length <= MAX_BYTES) return last;
    }
    return last; // laagste kwaliteit is nog te zwaar; de aanroeper meldt het
}

async function variant(srcBuf, hash, cacheDir, w, fmt) {
    const c = join(cacheDir, `${hash}.${w}.${fmt}`);
    if (existsSync(c)) {
        const cached = readFileSync(c);
        if (cached.length <= MAX_BYTES) return cached; // te zware cache-items (oudere, kortere ladder) opnieuw coderen
    }
    const out = await encode(sharp(srcBuf).rotate().resize({ width: w, withoutEnlargement: true }), fmt);
    writeFileSync(c, out);
    return out;
}

/** Maakt de varianten voor één bron. Geeft {widths, srcW, oversize:[…]} terug. */
export async function processImage(file, cacheDir) {
    const srcBuf = readFileSync(file);
    const hash = createHash('sha1').update(srcBuf).digest('hex').slice(0, 16);
    const { width: srcW } = await sharp(srcBuf).metadata();
    const widths = widthsFor(srcW);
    const base = file.replace(/\.jpg$/i, '');
    const oversize = [];
    for (const w of widths) {
        for (const fmt of ['avif', 'webp', 'jpg']) {
            const isBaseJpg = fmt === 'jpg' && w === widths[widths.length - 1];
            const buf = await variant(srcBuf, hash, cacheDir, w, fmt);
            if (buf.length > MAX_BYTES) oversize.push(`${relative(process.cwd(), file)} ${w}w ${fmt} ${Math.round(buf.length / 1024)} KB`);
            // De grootste jpg-variant vervangt het basisbestand (<= 400 KB); kleinere blijven .wN.jpg.
            writeFileSync(isBaseJpg ? file : `${base}.w${w}.${fmt}`, buf);
        }
    }
    return { widths, srcW, oversize };
}

const IMG_RE = /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/g;

function attr(tag, name) {
    const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
    return m ? (m[1] ?? m[2]) : null;
}

function sizesFor(tag, hero) {
    const w = Number(attr(tag, 'width'));
    // Een expliciete width (kaart-thumbnail) wint van de hero-heuristiek: een eager
    // kaart boven de vouw hoeft niet de 1200px-variant te halen.
    if (hero && !(w > 0 && w <= 800)) return '(min-width: 1200px) 1200px, 100vw';
    if (w > 0 && w <= 800) return `(min-width: 768px) ${w}px, 100vw`;
    return '(min-width: 1024px) 800px, 100vw';
}

/** Herschrijft de <img>-tags van één HTML-bestand. `info` = Map src-pad → {widths}. */
export function rewriteHtml(html, info) {
    const pictureRanges = [];
    for (const m of html.matchAll(/<picture\b[\s\S]*?<\/picture>/gi)) pictureRanges.push([m.index, m.index + m[0].length]);
    let heroSeen = false;
    let changed = 0;
    const out = html.replace(IMG_RE, (tag, index) => {
        if (pictureRanges.some(([a, b]) => index >= a && index < b)) return tag;
        if (/\ssrcset=/i.test(tag)) return tag;
        const src = attr(tag, 'src');
        const meta = src && info.get(src);
        if (!meta) return tag;

        const loading = attr(tag, 'loading');
        const cls = attr(tag, 'class') || '';
        const hero = !heroSeen && (loading === 'eager' || /hero/i.test(cls) || /\sfetchpriority=/i.test(tag));
        if (hero) heroSeen = true;

        const base = src.replace(/\.jpg$/i, '');
        const top = meta.widths[meta.widths.length - 1];
        const set = (fmt) =>
            meta.widths.map((w) => `${fmt === 'jpg' && w === top ? src : `${base}.w${w}.${fmt}`} ${w}w`).join(', ');
        const sizes = sizesFor(tag, hero);

        let img = tag.replace(/\/?>$/, '').replace(/\s+$/, '');
        img += ` srcset="${set('jpg')}" sizes="${sizes}"`;
        if (!/\sdecoding=/i.test(tag)) img += ' decoding="async"';
        if (hero) {
            if (!loading) img += ' loading="eager"';
            if (!/\sfetchpriority=/i.test(tag)) img += ' fetchpriority="high"';
        } else if (!loading) {
            img += ' loading="lazy"';
        }
        img += '>';

        changed++;
        return (
            `<picture style="display:contents">` +
            `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">` +
            `<source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">` +
            `${img}</picture>`
        );
    });
    return { html: out, changed };
}

export async function optimizeDist(dist, cacheDir) {
    mkdirSync(cacheDir, { recursive: true });
    const files = walk(dist, (p) => /\.jpg$/i.test(p) && !isVariantName(p) && (p.includes(`${sep}images${sep}`) || dirname(p) === dist));
    const info = new Map();
    const oversize = [];
    let next = 0;
    const worker = async () => {
        while (next < files.length) {
            const f = files[next++];
            const r = await processImage(f, cacheDir);
            info.set('/' + relative(dist, f).split(sep).join('/'), { widths: r.widths });
            oversize.push(...r.oversize);
        }
    };
    await Promise.all(Array.from({ length: 2 }, worker));

    let pages = 0;
    let imgs = 0;
    for (const f of walk(dist, (p) => p.endsWith('.html'))) {
        const html = readFileSync(f, 'utf8');
        if (!html.includes('.jpg')) continue;
        const r = rewriteHtml(html, info);
        if (r.changed) {
            writeFileSync(f, r.html);
            pages++;
            imgs += r.changed;
        }
    }
    return { images: files.length, pages, imgs, oversize };
}

async function main() {
    const root = process.cwd();
    const dist = process.argv[2] ? join(root, process.argv[2]) : join(root, 'dist');
    const cacheDir = process.env.IMAGE_VARIANT_CACHE || join(root, 'node_modules', '.cache', 'vm-image-variants');
    const r = await optimizeDist(dist, cacheDir);
    console.log(`[optimize-images] ${r.images} beelden -> AVIF/WebP/JPG x ${WIDTHS.join('/')}; ${r.imgs} <img> in ${r.pages} pagina's naar <picture>.`);
    if (r.oversize.length) {
        // Waarschuwing, geen buildfout: één pathologisch beeld mag de deploy niet blokkeren.
        console.warn(`[optimize-images] WAARSCHUWING: ${r.oversize.length} variant(en) blijven boven ${MAX_BYTES / 1024} KB:`);
        for (const o of r.oversize) console.warn(`  - ${o}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((e) => {
        console.error(`[optimize-images] ${e instanceof Error ? e.stack : e}`);
        process.exit(2);
    });
}
