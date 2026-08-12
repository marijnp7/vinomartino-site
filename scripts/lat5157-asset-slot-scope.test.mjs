/**
 * LAT-5157 — het asset-semafoorslot moet fetch + body-read + graden + wegschrijven
 * omvatten, in *élke* loader.
 *
 * Waarom dit een test is en geen code-review-afspraak:
 *
 * `withAssetSlot()` geeft zijn slot vrij zodra de callback klaar is. Wrap je
 * alléén `fetch()`, dan valt het slot al bij de *headers*, waarna
 * `res.arrayBuffer()` en het CPU-zware `gradeBuffer()` (sharp) ongelimiteerd
 * doorlopen. `DIRECTUS_ASSET_CONCURRENCY` begrenst dan alleen nog de TCP-
 * handshake en niets van het werk dat de event-loop daadwerkelijk verzadigt.
 *
 * Dat is precies de faalmodus uit [LAT-3423]: `UND_ERR_CONNECT_TIMEOUT
 * (directus:8055, 10000ms)` leest als "Directus weigert connecties", maar was
 * client-side uithongering — Directus antwoordde intussen met HTTP 200. Die
 * verkeerde lezing heeft twee dagen naar de verkeerde oorzaak geleid
 * ("Directus' Knex-DB-pool loopt vol", [LAT-3364]/[LAT-3331]).
 *
 * LAT-3587 heeft de scope in zes loaders rechtgezet maar liet `streken.ts`
 * staan — de grootste asset-consument van de build (30 streken x hero + og,
 * plus een geneste `Promise.all` over de verblijffoto's). Er stond geen test
 * onder, dus niets ving dat gat af. Deze test is die vangnet-laag: hij faalt
 * zodra een body-read of een grading-call buiten het slot komt te staan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Elke loader die build-time assets van Directus downloadt. */
const LOADERS = [
    'accommodaties-loader.ts',
    'articles.ts',
    'landen.ts',
    'reispakketten.ts',
    'routes.ts',
    'streken.ts',
    'wijnhuizen.ts',
];

/**
 * Werk dat ná de headers komt en dus binnen het slot hoort: het uitlezen van de
 * body en de sharp-grading. Dit is het werk dat de event-loop verzadigt.
 */
const MUST_BE_INSIDE_SLOT = [
    { label: 'body-read', re: /\.arrayBuffer\(\)/g },
    { label: 'grading', re: /gradeBuffer\(/g },
];

/**
 * Maskeer strings, template-literals, regexes en comments met spaties, zodat
 * haakjes-tellen alleen nog op échte code gebeurt. Zonder dit loopt de
 * paren-matcher vast op bv. `"(poging ${i}/${n})"` of een `)` in een comment.
 * De lengte blijft gelijk, dus alle indexen blijven geldig.
 */
function maskLiterals(src) {
    const out = src.split('');
    let i = 0;
    // Stack van template-literal-dieptes: ondersteunt `${ `nested` }`.
    const tmpl = [];
    while (i < src.length) {
        const c = src[i];
        const next = src[i + 1];
        if (c === '/' && next === '/') {
            while (i < src.length && src[i] !== '\n') out[i++] = ' ';
            continue;
        }
        if (c === '/' && next === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end === -1 ? src.length : end + 2;
            while (i < stop) {
                if (src[i] !== '\n') out[i] = ' ';
                i++;
            }
            continue;
        }
        if (c === "'" || c === '"') {
            out[i++] = ' ';
            while (i < src.length && src[i] !== c) {
                if (src[i] === '\\') out[i++] = ' ';
                if (i < src.length) out[i++] = ' ';
            }
            if (i < src.length) out[i++] = ' ';
            continue;
        }
        if (c === '`') {
            out[i++] = ' ';
            while (i < src.length) {
                if (src[i] === '\\') {
                    out[i++] = ' ';
                    if (i < src.length) out[i++] = ' ';
                    continue;
                }
                if (src[i] === '`') {
                    out[i++] = ' ';
                    break;
                }
                // `${ ... }` is weer echte code: laat hem staan en spring erover.
                if (src[i] === '$' && src[i + 1] === '{') {
                    let depth = 0;
                    do {
                        if (src[i] === '{') depth++;
                        else if (src[i] === '}') depth--;
                        i++;
                    } while (i < src.length && depth > 0);
                    continue;
                }
                if (src[i] !== '\n') out[i] = ' ';
                i++;
            }
            continue;
        }
        i++;
    }
    void tmpl;
    return out.join('');
}

/** Match het paar dat op `masked[open]` opent; geeft de index ná het sluitteken. */
function matchFrom(masked, open, oc, cc) {
    let depth = 0;
    let i = open;
    do {
        if (masked[i] === oc) depth++;
        else if (masked[i] === cc) depth--;
        i++;
    } while (i < masked.length && depth > 0);
    return i;
}

/**
 * Alle call-spans van `name(` in een gemaskeerde bron, als [start, end)-paren
 * over het volledige argument van de call.
 */
function callSpans(masked, name) {
    const spans = [];
    const marker = `${name}(`;
    let from = 0;
    for (;;) {
        const at = masked.indexOf(marker, from);
        if (at === -1) break;
        // Geen deel van een langere identifier (bv. `myWithAssetSlot(`).
        if (/[A-Za-z0-9_$]/.test(masked[at - 1] ?? '')) {
            from = at + marker.length;
            continue;
        }
        spans.push([at, matchFrom(masked, at + marker.length - 1, '(', ')')]);
        from = at + marker.length;
    }
    return spans;
}

/**
 * Lokale helpers die hun eigen callback-parameter *binnen* een `withAssetSlot()`
 * aanroepen — zoals `withAssetRetry(url, token, consume)` in streken.ts. Werk dat
 * aan zo'n helper wordt meegegeven draait dus wél onder de cap, ook al staat het
 * lexicaal buiten het `withAssetSlot(`-blok.
 *
 * Zonder deze stap zou de test correcte code rood maken en daarmee juist naar de
 * gedupliceerde retry-lus duwen die we niet willen. De helper wordt alleen
 * geaccepteerd als hij aantoonbaar zijn parameter in het slot aanroept.
 */
function slotBearingWrappers(masked, primarySpans) {
    const names = [];
    const declRe = /(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*(?:<[^(]*>)?\s*\(/g;
    for (const m of masked.matchAll(declRe)) {
        const name = m[1];
        const parenOpen = m.index + m[0].length - 1;
        const parenEnd = matchFrom(masked, parenOpen, '(', ')');
        const params = masked
            .slice(parenOpen + 1, parenEnd - 1)
            .split(',')
            .map((p) => p.trim().split(/[:=\s]/)[0])
            .filter((p) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p));
        const braceOpen = masked.indexOf('{', parenEnd - 1);
        if (braceOpen === -1) continue;
        const braceEnd = matchFrom(masked, braceOpen, '{', '}');
        const inBody = primarySpans.filter(([s, e]) => s > braceOpen && e <= braceEnd);
        const callsParamInSlot = params.some((p) =>
            callSpans(masked, p).some(([cs]) => inBody.some(([s, e]) => cs > s && cs < e)),
        );
        if (callsParamInSlot) names.push(name);
    }
    return names;
}

/** Alle spans waarbinnen werk onder de concurrency-cap valt. */
function boundedSpans(masked) {
    const primary = callSpans(masked, 'withAssetSlot');
    const spans = [...primary];
    for (const wrapper of slotBearingWrappers(masked, primary)) {
        spans.push(...callSpans(masked, wrapper));
    }
    return spans;
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

for (const file of LOADERS) {
    test(`LAT-5157: ${file} houdt body-read en grading binnen het asset-slot`, () => {
        const src = readFileSync(join(repoRoot, 'src', 'lib', file), 'utf8');
        const masked = maskLiterals(src);
        const spans = boundedSpans(masked);

        assert.ok(
            spans.length > 0,
            `${file} downloadt assets maar roept withAssetSlot() nergens aan — ` +
                `de globale concurrency-cap geldt daar dus niet.`,
        );

        const offenders = [];
        for (const { label, re } of MUST_BE_INSIDE_SLOT) {
            for (const m of masked.matchAll(new RegExp(re.source, 'g'))) {
                const idx = m.index;
                const inside = spans.some(([s, e]) => idx > s && idx < e);
                if (!inside) offenders.push(`${label} op ${file}:${lineOf(src, idx)}`);
            }
        }

        assert.deepEqual(
            offenders,
            [],
            `Deze call(s) staan BUITEN withAssetSlot(), waardoor het slot al bij de headers ` +
                `vrijvalt en het zware werk ongelimiteerd doorloopt (LAT-3423-uithongering):\n  ` +
                offenders.join('\n  '),
        );
    });
}
