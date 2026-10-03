/**
 * LAT-12110 — `herkomst` mag geen redactionele caption als fotograafnaam renderen.
 *
 * PR #370 liet de i18n-nl gate op `exit 33` vallen (nl-sentences + nl-nouns): sinds
 * LAT-12054 komt `author` uit `directus_files.herkomst`, en dat vrije tekstveld draagt
 * in 42 van de 994 DAM-rijen Nederlands proza naast de attributie. Prod is groen
 * (gemeten 29-09-2026, 299 /en/-pagina's, exit 0), dus de lek is nieuw en komt uit deze
 * branch.
 *
 * Alle `herkomst`-waarden hieronder zijn VERBATIM uit de live DAM overgenomen, niet
 * bedacht — ze zijn de shape-taxonomie die de opschoning moet overleven.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const workDir = mkdtempSync(join(tmpdir(), 'lat12110-herkomst-'));
test.after(() => rmSync(workDir, { recursive: true, force: true }));

const outfile = join(workDir, `credits.${process.pid}.mjs`);
await build({
    entryPoints: ['src/lib/image-credits.ts'],
    outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
});
const { parseHerkomst } = await import(outfile);

// De gate-dimensies die PR #370 rood maakten. Spiegel van NL_MARKERS/NL_NOUNS in
// scripts/lat2582-gate-check.py — hier alleen om te bewijzen dat er geen NL meer
// uit `maker` komt, niet als tweede gate.
const NL_WORDS = new Set([
    'het', 'een', 'dat', 'zijn', 'maar', 'ook', 'niet', 'naar', 'deze', 'dit', 'waar',
    'door', 'bij', 'uit', 'aan', 'geen', 'onder', 'achter', 'tussen', 'vastgesteld',
    'foto', 'beeld', 'kaart', 'wijngaard', 'wijngaarden', 'druiven', 'wijnhuis', 'dorp',
    'landschap', 'uitzicht', 'achtergrond', 'binnenstad', 'wijnstokken', 'velden',
    'blad', 'heuvels', 'avondlicht', 'oogstscene', 'slug', 'licentie', 'auteur',
]);
const nlWordsIn = (s) =>
    [...new Set((s.toLowerCase().match(/[\p{L}]+/gu) ?? []).filter((w) => NL_WORDS.has(w)))];

// [beschrijving, herkomst (verbatim uit de DAM), verwachte maker]
const CASES = [
    // ---- de drie pagina's die de gate noemde (LAT-12024 / commit 057881a) ----
    ['caption vóór de attributie (Riscal)',
        'Het door Frank Gehry ontworpen Hotel Marques de Riscal bij de bodega in Elciego, geopend in 2006. Foto: Roderich Kahn, CC BY-SA 4.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Elciego_-_Marqu%C3%A9s_de_Riscal_Hotel_RK01.jpg',
        'Roderich Kahn'],
    ['caption vóór de attributie (Calle Mayor)',
        'Hotel Calle Mayor in de oude binnenstad van Logrono. Foto: Vanbasten 23, CC BY-SA 3.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Sercotel_Calle_Mayor.jpg',
        'Vanbasten 23'],

    // ---- caption ACHTER de attributie ----
    ['caption achter de attributie, slash-vorm',
        'Foto: Naturpuur / Wikimedia Commons / CC BY-SA 4.0. Wijnstokken in vol blad, Brda-heuvels en dorp Šmartno op de achtergrond.',
        'Naturpuur'],
    ['caption achter de attributie, met haakjesnaam',
        'Foto: Missvain (Sarah Stierch) / Wikimedia Commons / CC BY 4.0. Non-alcoholic proefflight, februari 2023.',
        'Missvain (Sarah Stierch)'],
    ['LAT-12069-provenancestaart valt af',
        'Foto: jacilluch, CC BY-SA 2.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:RUTA.jpg. Herkomst vastgesteld op 29-09-2026 (LAT-12069) via IMAGE_CREDITS.md (LAT-2383) en Commons.',
        'jacilluch'],

    // ---- caption rondom, maker achter © ----
    ['maker achter © midden in de tekst',
        'Chardonnay druiven in de Puligny-Montrachet wijngaard in de Côte de Beaune regio van Bourgogne, France. © Bryan Dougherty, CC BY-SA 2.0. Source: Wikimedia Commons',
        'Bryan Dougherty'],
    ['maker achter (c) na een NL caption',
        'SS125 Orientale Sarda bij Dorgali, Barbagia (Provincie Nuoro), Sardinie. Bron: Wikimedia Commons, Gianni Careddu, CC BY-SA 4.0. (c) Gianni Careddu / Wikimedia Commons',
        'Gianni Careddu'],
    ['titel — foto: maker / bron licentie | bron: url',
        'Beaune et vignobles en automne (2018) — foto: Florian Pépellin / Wikimedia Commons CC BY-SA 4.0 | bron: https://commons.wikimedia.org/wiki/File:Beaune.jpg',
        'Florian Pépellin'],

    // ---- veldvormen ----
    ['Auteur: | Licentie: | Bron:', 'Auteur: Neil Weightman | Licentie: CC BY 2.0 | Bron: https://commons.wikimedia.org/wiki/File:Etna.jpg (ResourceSpace 1903)', 'Neil Weightman'],
    ['Beeld: maker, licentie — via bron', 'Beeld: konwiki/Wolfgang Glock, CC BY-SA 3.0 — via Wikimedia Commons', 'konwiki/Wolfgang Glock'],
    ['keywords-dump met Credit:', 'Wijnhuis slug: il-carnasciale-valdarno License: CC BY 2.0 Credit: Jason Parrish via Wikimedia Commons (CC BY 2.0) Alt-NL: Wijnstokken in de Chianti-wijnzone', 'Jason Parrish'],

    // ---- regressievallen: namen die eruit MOETEN blijven zoals ze zijn ----
    ['fotograaf die écht "Foto Fitti" heet blijft heel',
        'Foto: Foto Fitti, CC BY-SA 3.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Sonnenuhr.jpg. Herkomst vastgesteld op 29-09-2026 (LAT-12069) via zoekronde Commons.',
        'Foto Fitti'],
    ['lange eigennaam met komma blijft volledig',
        'Foto: Vitor Oliveira from Torres Vedras, PORTUGAL, CC BY-SA 2.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Quinta.jpg',
        'Vitor Oliveira from Torres Vedras, PORTUGAL'],
    ['instellingsnaam met "from" blijft volledig',
        'Foto: South African Tourism from South Africa, CC BY 2.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Franschhoek.jpg',
        'South African Tourism from South Africa'],
    ['canonieke vorm blijft ongewijzigd',
        'Foto: Pmau, CC BY-SA 4.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Spoy.jpg',
        'Pmau'],
    ['naam met User:-prefix blijft heel',
        'Foto: User:PhilippN, CC BY-SA 3.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File%3AHermanus.jpg. Teruggevonden via SHA1 op 29-09-2026.',
        'User:PhilippN'],

    // ---- geen maker te herleiden -> leeg, nooit proza ----
    ['pure caption zonder maker geeft leeg',
        'Regio-neutrale oogstscene: handmatige vroege pluk van witte druiven (Trebbiano) in een wijngaard, zomerlicht, groen blad (geen herfstverkleuring)',
        ''],
    ['keywords-dump zonder Credit: geeft leeg',
        'Slug: een-week-in-piemonte Artikel-id: 53 Cluster-rol: hub Regio: Langhe / La Morra Licentie: CC BY-SA 4.0 Keywords: vinomartino, editorial, wijngaard',
        ''],
    ['NL caption met maker achter een em-dash zonder label geeft leeg',
        'Het dorp Saint-Michel-de-Fronsac gezien vanuit de wijngaarden, Fronsac, Gironde, Frankrijk (2013)',
        ''],
];

for (const [naam, herkomst, verwacht] of CASES) {
    test(`maker: ${naam}`, () => {
        assert.equal(parseHerkomst(herkomst).maker, verwacht);
    });
}

// De enige rest-treffer, en hij is géén parserfout: DAM-bestand
// ca0e376d-57b4-48ef-bfa5-a09f8dd0afb1 heeft een fotograaf die "Foto Fitti" heet
// (Panoramio-handle, overgenomen op Commons). Zijn naam bevát het gate-noun "foto".
// De parser mag die naam niet verminken en de gate mag "foto" niet doorlaten — dat is
// een afweging, geen bug. Zie LAT-12110: óf de Commons-username vervangt de handle in
// `herkomst`, óf de gate krijgt hier een enge uitzondering. Tot die keuze valt staat de
// spanning hier expliciet, zodat niemand hem per ongeluk "oplost" door de naam te
// knippen.
const NL_IN_NAAM_BEKEND = new Set(['fotograaf die écht "Foto Fitti" heet blijft heel']);

test('geen enkele shape levert nog een Nederlands woord in maker', () => {
    const lekken = CASES
        .filter(([naam]) => !NL_IN_NAAM_BEKEND.has(naam))
        .map(([naam, herkomst]) => [naam, nlWordsIn(parseHerkomst(herkomst).maker)])
        .filter(([, w]) => w.length);
    assert.deepEqual(lekken, [], `NL-lek in maker: ${JSON.stringify(lekken)}`);
});

test('de bekende uitzondering is nog steeds precies één geval, en nog steeds echt', () => {
    // Valt deze test om, dan is de naamgevingskwestie opgelost (of verschoven) en
    // hoort de uitzondering te verdwijnen in plaats van mee te reizen.
    const nog = [...NL_IN_NAAM_BEKEND].filter((naam) => {
        const geval = CASES.find(([n]) => n === naam);
        return geval && nlWordsIn(parseHerkomst(geval[1]).maker).length > 0;
    });
    assert.deepEqual(nog, [...NL_IN_NAAM_BEKEND]);
});

test('bronnaam en bron-URL blijven intact na de maker-guard', () => {
    const p = parseHerkomst(CASES[0][1]);
    assert.equal(p.sourceLabel, 'Wikimedia Commons');
    assert.equal(p.sourceUrl, 'https://commons.wikimedia.org/wiki/File:Elciego_-_Marqu%C3%A9s_de_Riscal_Hotel_RK01.jpg');
});
