#!/usr/bin/env node
/**
 * LAT-2173 — post-build rendered-content guard.
 *
 * Runs AFTER `astro build`, over the generated `dist/**\/*.html`. It hard-fails
 * the deploy when a redactie-notitie / grid-placeholder leaks into the shipped
 * HTML. Concreet: `[Hier laadt het …-grid automatisch via Directus]` stond
 * letterlijk live op /landen/spanje|frankrijk|duitsland omdat de zin in de
 * Directus land-body zat (op Italië was hij al verwijderd).
 *
 * Waarom post-build i.p.v. een raw-CMS preflight: dit controleert wat we
 * daadwerkelijk publiceren, ongeacht de bron (CMS-body, showcase-hardcode of een
 * ander content-type). De render-strip in src/lib/landen.ts haalt de placeholder
 * al weg, dus deze scan is de vangnet-gate die voorkomt dat het ooit nog live
 * komt — zonder de deploy te blokkeren op een losse CMS-opschoning.
 *
 * Exit 1 (en print de bestanden + regels) zodra een verboden patroon in dist zit.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_DIR = process.env.DIST_DIR || 'dist';

// Elk patroon dat nooit in gepubliceerde HTML mag staan. Case-insensitief.
const FORBIDDEN = [
    { label: 'grid-placeholder', re: /\[\s*Hier laadt[^\]]*\]/i },
];

async function* walkHtml(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walkHtml(full);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
            yield full;
        }
    }
}

async function main() {
    const hits = [];
    let scanned = 0;
    for await (const file of walkHtml(DIST_DIR)) {
        scanned++;
        const html = await readFile(file, 'utf8');
        for (const pat of FORBIDDEN) {
            const m = html.match(pat.re);
            if (m) hits.push({ file, label: pat.label, snippet: m[0].slice(0, 120) });
        }
    }

    if (scanned === 0) {
        console.error(`[check-rendered] FAIL: geen HTML gevonden in '${DIST_DIR}' — is de build gelukt?`);
        process.exit(1);
    }

    if (hits.length > 0) {
        console.error(`[check-rendered] FAIL: ${hits.length} verboden placeholder(s) in gepubliceerde HTML (LAT-2173):`);
        for (const h of hits) {
            console.error(`  - ${h.file} [${h.label}]: "${h.snippet}"`);
        }
        console.error('[check-rendered] Verwijder de placeholder-zin uit de CMS-body of het component; de deploy is geblokkeerd.');
        process.exit(1);
    }

    console.log(`[check-rendered] OK: ${scanned} HTML-bestanden gescand, geen placeholder-lekken.`);
}

main().catch((err) => {
    console.error(`[check-rendered] onverwachte fout: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
});
