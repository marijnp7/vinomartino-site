#!/usr/bin/env node
/**
 * LAT-7703 — EN-copy voor de twee gestructureerde tekstblokken van het
 * Épernay-artikel (articles/107 → articles_translations/80).
 *
 * Vereist dat lat7703-add-article-block-translation-fields.mjs al gedraaid is
 * (kolommen op de junction) en dat de code-fix `proefnotities`/`eerst_dit_boeken`
 * in ARTICLES_TRANSLATABLE heeft staan — anders wordt dit nooit gelezen.
 *
 * Vorm van de blobs: bewust ALLEEN de vertaalbare keys, geen dupliceren van
 * eigennamen/prijs/jaar/foto-UUID. mergeTranslatedValue() (directus-i18n.ts)
 * merget element-gewijs op index over de NL-basis, dus de arrays moeten dezelfde
 * lengte en volgorde houden als NL. Daarom staat er een lege `{}` waar een item
 * niets te vertalen heeft — dat is geen bug maar de index-uitlijning.
 *
 * Idempotent: schrijft één PATCH met de volledige blobs.
 *
 * Run:
 *   /paperclip/scripts/directus-run-internal.sh \
 *     --script directus/scripts/lat7703-seed-epernay-block-translations.mjs -- --dry-run
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_TOKEN || process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('DIRECTUS_TOKEN (or ADMIN_TOKEN) is required.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');

const ARTICLE_ID = 107;
const TRANSLATION_ID = 80;

// Index-uitgelijnd met de NL-arrays op articles/107. Zie kop.
const EN = {
    proefnotities: [
        {
            notitie: 'RM since 1922. 50% pinot noir, 50% meunier, from forty-year-old vines. Saignée: fourteen hours of skin contact, dosage 6 g/l.',
            etiket_foto_alt: 'Bottle of Perle de Saignée with récoltant-manipulant depuis 1922 on the label',
        },
        {
            notitie: 'The only house on the list from the Côte des Bar. A white wine pressed from black grapes.',
        },
        {
            notitie: 'Nutty and matured. Named after Edmond Dubois, who in 1911 led the Champagne growers’ revolt and earned the nickname "Rédempteur de la Champagne".',
        },
    ],
    eerst_dit_boeken: [
        {
            handeling: 'Check the current opening hours on their own site before you set off — the boutique page and the main site contradict each other. 15 Place de la République, Épernay.',
        },
        {
            handeling: 'Book a table for dinner, in the former Banque de France building, Épernay.',
        },
        {
            handeling: 'Only worth the detour for the Millésime 2022 Blanc de Blancs, Hautvillers.',
        },
    ],
};

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
    const res = await fetch(`${DIRECTUS_URL}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text };
}

async function main() {
    const nl = await api('GET', `/items/articles/${ARTICLE_ID}?fields=slug,proefnotities,eerst_dit_boeken`);
    if (!nl.ok) { console.error(`FAIL lezen articles/${ARTICLE_ID}: ${nl.status} ${nl.text.slice(0, 300)}`); process.exit(1); }

    // Index-uitlijning is de hele merge-semantiek; een stille lengteafwijking zou
    // EN-tekst aan de verkeerde fles/boeking plakken. Hard falen, niet doorgaan.
    for (const field of ['proefnotities', 'eerst_dit_boeken']) {
        const base = nl.json.data[field];
        if (!Array.isArray(base) || base.length !== EN[field].length) {
            console.error(`FAIL ${field}: NL heeft ${Array.isArray(base) ? base.length : 'geen array'} items, EN-blob heeft ${EN[field].length}. Herzie de vertaling voor je schrijft.`);
            process.exit(1);
        }
    }
    console.log(`NL-basis (${nl.json.data.slug}) uitgelijnd: proefnotities=${EN.proefnotities.length}, eerst_dit_boeken=${EN.eerst_dit_boeken.length}`);

    if (DRY) { console.log('\n--dry-run — zou PATCHen:\n' + JSON.stringify(EN, null, 1)); return; }

    const res = await api('PATCH', `/items/articles_translations/${TRANSLATION_ID}`, EN);
    if (!res.ok) { console.error(`FAIL PATCH articles_translations/${TRANSLATION_ID}: ${res.status} ${res.text.slice(0, 400)}`); process.exit(1); }

    // Terugleen: een 200 bewijst niet dat de kolom de waarde hield (zie LAT-7703
    // — precies dit stille-dropgedrag was de oorspronkelijke bug).
    const back = await api('GET', `/items/articles_translations/${TRANSLATION_ID}?fields=proefnotities,eerst_dit_boeken`);
    const got = back.json?.data || {};
    const bad = ['proefnotities', 'eerst_dit_boeken'].filter(
        (f) => !Array.isArray(got[f]) || got[f].length !== EN[f].length,
    );
    if (bad.length) {
        console.error(`FAIL na PATCH niet teruggelezen: ${bad.join(', ')} → ${JSON.stringify(got).slice(0, 300)}`);
        process.exit(1);
    }
    console.log(`OK — EN-blobs staan in articles_translations/${TRANSLATION_ID} en zijn teruggelezen.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
