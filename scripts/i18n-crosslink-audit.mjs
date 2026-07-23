#!/usr/bin/env node
/**
 * LAT-2829 — meet de cross-linkblokken op gerenderde /en/-HTML.
 *
 * De DoD van de ticket is niet "de code roept de overlay aan" maar "op
 * /en/-detailpagina's bevat geen enkel cross-linkblok nog een NL titel/naam,
 * gemeten op gerenderde HTML". Deze audit doet precies die meting tegen een
 * draaiende site (prod of preview), zodat de uitkomst niet afhangt van of ik de
 * loader goed heb gelezen.
 *
 * Methode — bewust vergelijkend, niet taalkundig:
 *   1. Bouw uit de NL-listings een map slug → NL-label en uit de /en/-listings
 *      een map slug → EN-label, per entiteitstype.
 *   2. Loop over de /en/-detailpagina's en pak elke anchor die naar een
 *      /en/<type>/<slug>/ wijst.
 *   3. Een LEK is: het anchorlabel is exact het NL-label, terwijl er voor die
 *      slug een EN-label bestaat dat ervan verschilt. Geen heuristiek op
 *      "ziet er Nederlands uit", dus geen vals-positieven op eigennamen
 *      (wijnhuizen/hotels heten in beide talen hetzelfde) en geen vals-negatief
 *      op een toevallig gelijk woord.
 *
 * Gebruik:
 *   node scripts/i18n-crosslink-audit.mjs [--base https://vinomartino.com]
 *                                         [--limit 40] [--strict]
 *
 * `--strict` geeft exit 1 zodra er één lek is (bruikbaar als gate); zonder die
 * vlag is dit een rapport en is exit altijd 0.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const BASE = (arg('base', 'https://vinomartino.com')).replace(/\/$/, '');
const LIMIT = Number(arg('limit', '40'));
const STRICT = args.includes('--strict');

// Entiteitstypes met een /en/-listing én /en/-detailpagina's. `wijnhuizen` en
// `accommodaties` staan hier bewust niet als LABELBRON: hun namen zijn
// eigennamen en staan niet in de translations-junction, dus daar valt niets
// te lekken.
const TYPES = [
    { seg: 'artikelen', label: 'artikel' },
    { seg: 'streken', label: 'streek' },
    { seg: 'landen', label: 'land' },
    // De loader heet `routes.ts`, maar het URL-segment is `wijnroutes` (`/routes/`
    // is een 301 naar `/wijnroutes/` en `/en/routes/` bestaat niet). Met het
    // verkeerde segment leverde dit type nul labels én nul detailpagina's op —
    // stil, want nul lekken op nul cross-links leest als groen. Vandaar ook de
    // niet-leeg-guard hieronder.
    { seg: 'wijnroutes', label: 'wijnroute' },
];

async function get(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    return res.text();
}

function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Het zichtbare label van een kaart-anchor. De markup verschilt per plek maar is
 * consistent genoeg om exact te targeten i.p.v. te raden:
 *   - cross-linkblok:  <a class="related-card">…<span class="related-name">LABEL</span></a>
 *   - listing-kaart:   <a class="article-card">…<h2 class="article-title">LABEL</h2>…</a>
 * Vandaar deze volgorde; de volledige anchortekst is alleen de laatste redmiddel
 * (die bevat op een listing ook rubriek, excerpt en auteur).
 */
function cardLabel(inner) {
    const named = inner.match(/<span[^>]*class="[^"]*related-name[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    if (named) return stripTags(named[1]);
    const heading = inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/);
    if (heading) return stripTags(heading[1]);
    const titled = inner.match(/<[a-z]+[^>]*class="[^"]*-title[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/);
    if (titled) return stripTags(titled[1]);
    return stripTags(inner);
}

function anchors(html, prefix, seg, { relatedOnly = false } = {}) {
    const out = [];
    const re = new RegExp(
        `<a([^>]+)href="${prefix}/${seg}/([^"/]+)/?"([^>]*)>([\\s\\S]*?)</a>`,
        'g',
    );
    for (const m of html.matchAll(re)) {
        // Alleen de cross-linkblokken tellen mee voor de meting: de footer- en
        // nav-links naar dezelfde slugs zijn een ander (al opgelost) probleem en
        // zouden de noemer met duizenden regels opblazen.
        if (relatedOnly && !/related-card/.test(m[1] + m[3])) continue;
        const label = cardLabel(m[4]);
        if (label) out.push({ slug: m[2], label });
    }
    return out;
}

/** slug → langste gevonden label (kaarten tonen de volledige titel). */
function labelMap(entries) {
    const map = new Map();
    for (const { slug, label } of entries) {
        const prev = map.get(slug);
        if (!prev || label.length > prev.length) map.set(slug, label);
    }
    return map;
}

async function main() {
    console.log(`[crosslink-audit] basis: ${BASE}`);

    const nl = new Map();
    const en = new Map();
    for (const t of TYPES) {
        const nlHtml = await get(`${BASE}/${t.seg}/`);
        const enHtml = await get(`${BASE}/en/${t.seg}/`);
        nl.set(t.seg, labelMap(nlHtml ? anchors(nlHtml, '', t.seg) : []));
        en.set(t.seg, labelMap(enHtml ? anchors(enHtml, '/en', t.seg) : []));
        console.log(
            `[crosslink-audit] ${t.seg}: ${nl.get(t.seg).size} NL-labels, ${en.get(t.seg).size} EN-labels`,
        );
    }

    // Een type zonder labels is geen "geen lekken", het is een niet-uitgevoerde
    // meting: verkeerd segment, gewijzigde markup of een listing die 404't.
    // Hard falen, anders rapporteert de audit groen over wat hij niet zag.
    const empty = TYPES.filter((t) => en.get(t.seg).size === 0).map((t) => t.seg);
    if (empty.length) {
        throw new Error(
            `geen /en/-labels gevonden voor: ${empty.join(', ')} — segment of markup gewijzigd, meting is niet uitgevoerd`,
        );
    }

    // Detailpagina's: alle /en/-slugs die de EN-listings noemen.
    // Rond-robin over de types: een `slice(0, LIMIT)` op een gesorteerde lijst
    // zou alleen artikelen pakken en juist de landen-/streekpagina's uit de
    // ticket-voorbeelden overslaan.
    const perType = TYPES.map((t) => [...en.get(t.seg).keys()].map((slug) => `/en/${t.seg}/${slug}/`));
    const pages = [];
    for (let i = 0; perType.some((l) => i < l.length); i++) {
        for (const list of perType) if (i < list.length) pages.push(list[i]);
    }
    const targets = pages.slice(0, LIMIT);
    console.log(`[crosslink-audit] scan ${targets.length} van ${pages.length} /en/-detailpagina's\n`);

    const leaks = [];
    let scanned = 0;
    let crossLinks = 0;
    for (const path of targets) {
        const html = await get(`${BASE}${path}`);
        if (!html) continue;
        scanned++;
        for (const t of TYPES) {
            for (const { slug, label } of anchors(html, '/en', t.seg, { relatedOnly: true })) {
                // Zelfverwijzing / breadcrumb naar de eigen pagina telt niet mee.
                if (path === `/en/${t.seg}/${slug}/`) continue;
                const nlLabel = nl.get(t.seg).get(slug);
                const enLabel = en.get(t.seg).get(slug);
                if (!nlLabel || !enLabel) continue;
                crossLinks++;
                if (label === nlLabel && enLabel !== nlLabel) {
                    leaks.push({ path, target: `/en/${t.seg}/${slug}/`, label, expected: enLabel });
                }
            }
        }
    }

    console.log(`[crosslink-audit] ${scanned} pagina's, ${crossLinks} beoordeelbare cross-links`);
    if (leaks.length === 0) {
        console.log('[crosslink-audit] OK — geen NL-label in een /en/-cross-linkblok.');
        return;
    }
    console.log(`[crosslink-audit] ${leaks.length} NL-lek(ken):\n`);
    for (const l of leaks) {
        console.log(`  ${l.path}`);
        console.log(`    → ${l.target}`);
        console.log(`      toont:    ${l.label}`);
        console.log(`      verwacht: ${l.expected}\n`);
    }
    const ratio = crossLinks ? (leaks.length / crossLinks) : 0;
    console.log(`[crosslink-audit] lekratio: ${leaks.length}/${crossLinks} = ${ratio.toFixed(3)}`);
    if (STRICT) process.exitCode = 1;
}

main().catch((err) => {
    console.error(`[crosslink-audit] FOUT: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
});
