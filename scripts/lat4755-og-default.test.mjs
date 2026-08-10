/**
 * LAT-4755 — site-brede default-OG-afbeelding.
 *
 * Waarom deze test bestaat
 * ------------------------
 * Op LAT-4754 is gemeten dat 34 van de 546 live-URLs géén `og:image` hadden: de
 * keten in SiteLayout was `og_image` → `hero_image` → niets. Niets in de pagina
 * verried dat — de HTML rendert prima, alleen de deelkaart is weg. Precies die
 * stilte maakt het een testbare defectklasse in plaats van iets dat je bij de
 * volgende wijziging vanzelf opmerkt.
 *
 * De twee dingen die stil kunnen breken:
 *  1. de fallback verdwijnt uit SiteLayout, of wijst naar een bestand dat niet
 *     in public/ staat → terug naar 34 kale deelkaarten;
 *  2. de kaart wordt opnieuw gegenereerd op een ander formaat, terwijl
 *     SiteLayout `og:image:width/height` hard op 1200×630 zet → de declaratie
 *     wordt een leugen en crawlers croppen de kaart verkeerd.
 *
 * Plus een zelftest op de leegte-check: `sharp` levert ook een keurige PNG op
 * wanneer de fonts niet laadden en er dus niets is gerenderd, dus "bestand
 * bestaat en is een geldige PNG" bewijst niets. Zie ook de kanarie in
 * gen-og-default.mjs.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = readFileSync(resolve(REPO, 'src/layouts/SiteLayout.astro'), 'utf8');

/** Leest een `const NAAM = '...'` uit de frontmatter van SiteLayout. */
function layoutConst(name) {
    const m = LAYOUT.match(new RegExp(`const ${name} = '([^']+)'`));
    assert.ok(m, `SiteLayout.astro mist \`const ${name}\``);
    return m[1];
}

/** Leest het getal uit `<meta property="og:image:${dim}" content="N" />`. */
function declaredDimension(dim) {
    const m = LAYOUT.match(new RegExp(`og:image:${dim}" content="(\\d+)"`));
    assert.ok(m, `SiteLayout.astro mist een og:image:${dim}-declaratie`);
    return Number(m[1]);
}

test('SiteLayout valt terug op een default-OG wanneer de pagina geen eigen beeld heeft', () => {
    // Literal uit de live code, niet nagetypt: breekt de fallback, dan breekt dit.
    assert.match(
        LAYOUT,
        /const ogImageUrl = pageOgImageUrl \?\? toAbsoluteUrl\(DEFAULT_OG_IMAGE\);/,
        'de og:image-keten eindigt niet meer in DEFAULT_OG_IMAGE — pagina\'s zonder eigen beeld krijgen weer géén deelkaart',
    );
    assert.match(
        LAYOUT,
        /<meta property="og:image" content=\{ogImageUrl\} \/>/,
        'og:image wordt niet meer uit ogImageUrl gerenderd',
    );
});

test('de default-OG die SiteLayout noemt staat ook echt in public/', () => {
    const ref = layoutConst('DEFAULT_OG_IMAGE');
    assert.ok(ref.startsWith('/'), `DEFAULT_OG_IMAGE moet een site-absoluut pad zijn, is '${ref}'`);
    assert.ok(
        existsSync(resolve(REPO, 'public', ref.slice(1))),
        `DEFAULT_OG_IMAGE wijst naar ${ref}, maar public${ref} bestaat niet — elke deelkaart zou een 404 laden`,
    );
});

test('het formaat van de kaart klopt met de og:image:width/height die SiteLayout declareert', async () => {
    const file = resolve(REPO, 'public', layoutConst('DEFAULT_OG_IMAGE').slice(1));
    const meta = await sharp(readFileSync(file)).metadata();
    assert.equal(meta.width, declaredDimension('width'));
    assert.equal(meta.height, declaredDimension('height'));
});

test('de kaart is niet leeg — en de leegte-check zou een lege kaart betrappen', async () => {
    const file = resolve(REPO, 'public', layoutConst('DEFAULT_OG_IMAGE').slice(1));
    const spread = async (buf) =>
        Math.max(...(await sharp(buf).stats()).channels.map((c) => c.stdev));

    // Falsifieerbaarheid eerst: een egaal vlak is precies wat gen-og-default.mjs
    // oplevert als fontconfig faalt, en moet ruim ónder de drempel vallen.
    const blank = await sharp({
        create: { width: 1200, height: 630, channels: 3, background: '#5A1A1F' },
    })
        .png()
        .toBuffer();
    assert.ok(
        (await spread(blank)) < 10,
        'de leegte-check keurt een egaal vlak goed en bewijst dus niets',
    );

    assert.ok(
        (await spread(readFileSync(file))) >= 10,
        'de default-OG lijkt een egaal vlak: waarschijnlijk zijn bij het genereren de fonts niet geladen',
    );
});
