#!/usr/bin/env node
// scripts/check-c2pa.mjs — LAT-12054
//
// Buildcheck: bevat een gedownload asset een C2PA/JUMBF-manifest (bytes `c2pa` of
// `jumb` in de eerste 400 KB van het ORIGINEEL) en staat het bestand in de DAM niet
// als synthetisch, dan faalt de productiebuild met de lijst bestanden.
//
// Waarom het origineel: `assetUrl()` laat Directus naar jpg/1600 transformeren en
// `gradeBuffer` herschrijft het daarna; beide gooien APP11/JUMBF-segmenten weg. Het
// manifest is dus alleen op `/assets/<id>` zonder transform te zien. We lezen
// hooguit 400 KB per bestand (Range, met harde afkap als de server Range negeert).
//
// Welke bestanden: elk UUID-bestand onder public/images/** (zelfde set die de
// loaders daar wegschrijven). "Synthetisch in de DAM" = `synthetisch === true` of
// de regex van src/lib/synthetic-images.ts (pariteit getest).
//
// Preview-builds (DIRECTUS_INCLUDE_DRAFTS=1) en ALLOW_CONTENT_DEGRADE=1 waarschuwen
// alleen; productie faalt (exit 1). Exit 2 = de check kon niet draaien (env/DAM).

import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCAN_BYTES = 400 * 1024;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Pariteit met SYNTHETIC_META_RE in src/lib/synthetic-images.ts (test bewaakt dit).
export const SYNTHETIC_META_RE =
    /synthetisch|synthetic|ai-render|ai render|ai-gegenereerd|ai gegenereerd|midjourney|dall-?e|stable diffusion|gpt-image|vinomartino \/ atelier/i;

/** True als de eerste 400 KB van `buf` een C2PA/JUMBF-marker bevatten. */
export function hasC2paManifest(buf) {
    const head = buf.subarray(0, SCAN_BYTES);
    return head.includes('c2pa') || head.includes('jumb');
}

export function isDeclaredSynthetic(meta) {
    if (!meta) return false;
    if (meta.synthetisch === true) return true;
    return SYNTHETIC_META_RE.test(
        JSON.stringify([meta.title, meta.description, meta.tags, meta.filename_download]),
    );
}

/** Alle UUID's uit bestandsnamen onder `dir` (recursief), met het pad waar ze staan. */
export function collectAssetIds(dir) {
    const out = new Map();
    const walk = (d) => {
        for (const name of readdirSync(d)) {
            const p = join(d, name);
            if (statSync(p).isDirectory()) walk(p);
            else {
                const m = UUID_RE.exec(name);
                if (m) out.set(m[0].toLowerCase(), p);
            }
        }
    };
    walk(dir);
    return out;
}

/** Leest hooguit SCAN_BYTES van `url` (Range; stopt zelf als de server Range negeert). */
export async function fetchHead(url, token, fetchImpl = fetch) {
    const res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${SCAN_BYTES - 1}` },
        signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
        chunks.push(chunk);
        total += chunk.length;
        if (total >= SCAN_BYTES) break;
    }
    if (res.body.cancel) await res.body.cancel().catch(() => {});
    return Buffer.concat(chunks).subarray(0, SCAN_BYTES);
}

async function withRetry(fn, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
        try {
            return await fn();
        } catch (e) {
            last = e;
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw last;
}

/**
 * Kern: geeft { checked, undeclared: [{id, path}], errors: [{id, error}] }.
 * `metaById` is een Map id → DAM-meta; een id zonder DAM-rij telt als niet-synthetisch.
 */
export async function findUndeclaredC2pa({ ids, metaById, directusUrl, token, concurrency = 6, fetchImpl = fetch }) {
    const undeclared = [];
    const errors = [];
    const queue = [...ids.entries()];
    let checked = 0;
    const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
            const [id, path] = next;
            if (isDeclaredSynthetic(metaById.get(id))) continue;
            try {
                const head = await withRetry(() => fetchHead(`${directusUrl}/assets/${id}`, token, fetchImpl));
                checked++;
                if (hasC2paManifest(head)) undeclared.push({ id, path });
            } catch (e) {
                errors.push({ id, path, error: e instanceof Error ? e.message : String(e) });
            }
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { checked, undeclared, errors };
}

async function main() {
    const url = (process.env.DIRECTUS_URL || '').trim().replace(/\/$/, '');
    const token = (process.env.DIRECTUS_TOKEN || '').trim();
    const relaxed = process.env.DIRECTUS_INCLUDE_DRAFTS === '1' || process.env.ALLOW_CONTENT_DEGRADE === '1';
    const dirArg = process.argv.indexOf('--images-dir');
    const imagesDir = dirArg > -1 ? process.argv[dirArg + 1] : join(process.cwd(), 'public', 'images');

    if (!url || !token) {
        console.error('[check-c2pa] DIRECTUS_URL/DIRECTUS_TOKEN ontbreken — kan de C2PA-check niet draaien.');
        process.exit(relaxed ? 0 : 2);
    }

    const ids = collectAssetIds(imagesDir);
    const res = await fetch(
        `${url}/files?limit=-1&fields=id,title,description,tags,filename_download,synthetisch`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) },
    );
    if (!res.ok) {
        console.error(`[check-c2pa] /files gaf HTTP ${res.status} — DAM-vlag onleesbaar, check niet uitvoerbaar.`);
        process.exit(relaxed ? 0 : 2);
    }
    const files = (await res.json()).data || [];
    if (files.length === 0) {
        console.error('[check-c2pa] /files gaf 0 bestanden — kapotte query of permissie, geen lege DAM.');
        process.exit(relaxed ? 0 : 2);
    }
    const metaById = new Map(files.map((f) => [String(f.id).toLowerCase(), f]));

    const { checked, undeclared, errors } = await findUndeclaredC2pa({ ids, metaById, directusUrl: url, token });
    console.log(`[check-c2pa] ${ids.size} UUID-assets in ${imagesDir}, ${checked} originelen gescand (eerste ${SCAN_BYTES / 1024} KB).`);

    for (const e of errors) console.error(`[check-c2pa] kon ${e.id} niet lezen: ${e.error}`);
    if (undeclared.length) {
        console.error(`[check-c2pa] ${undeclared.length} bestand(en) met C2PA-manifest, maar niet als synthetisch in de DAM:`);
        for (const u of undeclared) console.error(`  - ${u.id}  (${basename(u.path)})`);
        console.error('Zet directus_files.synthetisch=true (of corrigeer de bron) en bouw opnieuw.');
    }
    if (undeclared.length || errors.length) process.exit(relaxed ? 0 : 1);
    console.log('[check-c2pa] OK: geen C2PA-manifest zonder synthetisch-vlag.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((e) => {
        console.error(`[check-c2pa] onverwachte fout: ${e instanceof Error ? e.stack : e}`);
        process.exit(2);
    });
}
