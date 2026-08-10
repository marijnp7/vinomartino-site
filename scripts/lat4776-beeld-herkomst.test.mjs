/**
 * LAT-4776 — beeld-niveau §7-disclosure voor AI-beeld.
 *
 * Waarom deze test bestaat
 * ------------------------
 * DESIGN_GUIDELINES §7 eist een markering bij AI-Tier 2-beeld. Die was nooit
 * gebouwd: de zichtbare "Redactiegids"-badge is een zuivere functie van
 * `articles.zelf_gereisd` (reisprovenance) en zegt over het beeld niets. In
 * LAT-4761 leidde die naamsgelijkenis bijna tot een detector-regex met het woord
 * `redactiegids` erin — dat zou 73 artikelpagina's permanent als "gedisclosed"
 * markeren en de detector blind maken voor precies de defectklasse waarvoor hij
 * is gebouwd (vier keer teruggekomen: LAT-4713 → 4725 → 4729 → 4761).
 *
 * De tests die er echt toe doen:
 *  1. regex-pariteit met /paperclip/ops/lat4745-synth-inventory.mjs. Site en
 *     detector MOETEN dezelfde populatie zien; divergeren ze, dan meldt de
 *     detector rood op beeld dat de site niet markeert.
 *  2. de copy hergebruikt het woord "Redactiegids" NIET.
 *  3. een mislukte of lege DAM-read faalt luid i.p.v. stil "geen AI-beeld" te
 *     concluderen — dat laatste zou de disclosure geruisloos van de site halen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

// Eigen tmp-map: alle agents in deze container delen één /tmp onder dezelfde
// uid, dus een vaste bestandsnaam wordt stil door een andere run overschreven.
const workDir = mkdtempSync(join(tmpdir(), 'lat4776-beeldherkomst-'));

/** Regex zoals hij in de detector-inventaris staat (bron: LAT-4745). */
const DETECTOR_RE_SOURCE =
    'synthetisch|synthetic|ai-render|ai render|ai-gegenereerd|ai gegenereerd|midjourney|dall-?e|stable diffusion|gpt-image|vinomartino \\/ atelier';

/** Echte DAM-metadata van de articles/92-hero (LAT-3241 gravure-illustratie). */
const ART92_HERO = {
    id: '86cc34e0-dbc8-4c79-96e6-aff7567467df',
    title: 'LAT-3241 — Of Choice & Measure (Tier 2 gravure-illustratie, wijnglas & fles)',
    description:
        'AI-gegenereerd (Atelier, gpt-image-2), niet-fotorealistische gravure-/lijnstijl illustratie volgens DESIGN_GUIDELINES.md § 7 Atelier-huisprompt.',
    tags: null,
    filename_download: 'lat3241-hero.jpg',
};

/** Echte DAM-metadata van een gewone foto (de detector-canary, live op de site). */
const ECHTE_FOTO = {
    id: '41baa67e-4388-4643-919a-fbf1af35a172',
    title: 'Antinori nel Chianti Classico (Bargino)',
    description: null,
    tags: null,
    filename_download: 'antinori-bargino.jpg',
};

async function loadModule(name, entry) {
    const outfile = join(workDir, `${name}.${process.pid}.mjs`);
    await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
    return import(`${outfile}?v=${Math.random()}`);
}

const loadSynth = () => loadModule('synthetic-images', 'src/lib/synthetic-images.ts');

function stubFetch(handler) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(String(url));
        return handler(String(url), init, calls.length);
    };
    return calls;
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify({ data }), { status, headers: { 'content-type': 'application/json' } });
}

function withDirectusEnv(fn) {
    const prev = { url: process.env.DIRECTUS_URL, token: process.env.DIRECTUS_TOKEN, degrade: process.env.ALLOW_CONTENT_DEGRADE, drafts: process.env.DIRECTUS_INCLUDE_DRAFTS };
    process.env.DIRECTUS_URL = 'http://directus.test';
    process.env.DIRECTUS_TOKEN = 'test-token';
    delete process.env.ALLOW_CONTENT_DEGRADE;
    delete process.env.DIRECTUS_INCLUDE_DRAFTS;
    return Promise.resolve(fn()).finally(() => {
        for (const [k, v] of [['DIRECTUS_URL', prev.url], ['DIRECTUS_TOKEN', prev.token], ['ALLOW_CONTENT_DEGRADE', prev.degrade], ['DIRECTUS_INCLUDE_DRAFTS', prev.drafts]]) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    });
}

test.after(() => rmSync(workDir, { recursive: true, force: true }));

test('de site gebruikt exact de regex van de detector-inventaris', async () => {
    const { SYNTHETIC_META_RE } = await loadSynth();
    assert.equal(
        SYNTHETIC_META_RE.source,
        DETECTOR_RE_SOURCE,
        'SYNTHETIC_META_RE is afgeweken van de detector-regex — site en detector zien dan een ' +
            'andere populatie. Pas beide aan, of het verschil komt terug als een rode detector-run.',
    );
});

test('regex-pariteit met de LIVE detector-inventaris', async (t) => {
    const inventory = '/paperclip/ops/lat4745-synth-inventory.mjs';
    if (!existsSync(inventory)) {
        // Buiten de agent-container (GitHub runner) bestaat /paperclip niet. De
        // literal hierboven blijft dan de assertie; deze test dekt de tweede
        // kant: dat die literal nog klopt met wat er écht draait.
        t.skip(`${inventory} niet aanwezig — literal-pariteit is al getest hierboven`);
        return;
    }
    const src = readFileSync(inventory, 'utf8');
    const m = /^const re = \/(.+)\/i;$/m.exec(src);
    assert.ok(m, 'kon de regex niet uit lat4745-synth-inventory.mjs halen — is het script herschreven?');
    assert.equal(m[1], DETECTOR_RE_SOURCE, 'de detector-inventaris is gewijzigd; werk SYNTHETIC_META_RE en deze test bij');
});

test('AI-metadata matcht, een echte foto niet', async () => {
    const { fileMetaIsSynthetic } = await loadSynth();
    assert.equal(fileMetaIsSynthetic(ART92_HERO), true);
    assert.equal(fileMetaIsSynthetic(ECHTE_FOTO), false);
});

test('de disclosure-copy hergebruikt het woord "Redactiegids" niet', async () => {
    const { UI_STRING_DEFAULTS, UI_STRING_EN } = await loadModule('ui-strings', 'src/lib/ui-strings.ts');
    const keys = ['ui.beeldherkomst.ai', 'ui.beeldherkomst.ai.title'];
    for (const key of keys) {
        const nl = UI_STRING_DEFAULTS[key];
        assert.ok(nl, `ontbrekende NL-default voor ${key}`);
        assert.ok(UI_STRING_EN[key], `ontbrekende EN-default voor ${key} — /en/ zou anders Nederlands tonen`);
        for (const value of [nl, UI_STRING_EN[key]]) {
            assert.doesNotMatch(
                value,
                /redactiegids/i,
                'twee signalen op één label is exact de verwarring uit LAT-4761 — kies een eigen formulering',
            );
        }
    }
    // De NL-copy moet zelf al door de detector-regex komen; de EN-copy leunt op
    // het locale-onafhankelijke data-attribuut (zie SYNTHETIC_MARKER_ATTR).
    assert.match(UI_STRING_DEFAULTS['ui.beeldherkomst.ai'], new RegExp(DETECTOR_RE_SOURCE, 'i'));
});

test('de machineleesbare marker komt door de detector-regex', async () => {
    const { SYNTHETIC_MARKER_ATTR } = await loadSynth();
    assert.match(
        `data-beeldherkomst="${SYNTHETIC_MARKER_ATTR}"`,
        new RegExp(DETECTOR_RE_SOURCE, 'i'),
        'het data-attribuut is de enige disclosure die de detector op /en/-paginas ziet',
    );
});

test('assetIdFromSrc haalt de UUID uit gebuildde paden, ook met prefix', async () => {
    const { assetIdFromSrc } = await loadSynth();
    const id = '86cc34e0-dbc8-4c79-96e6-aff7567467df';
    assert.equal(assetIdFromSrc(`/images/articles/${id}.jpg`), id);
    assert.equal(assetIdFromSrc(`/images/wijnhuizen/dl-plek-${id}.jpg`), id, 'drieluik-prefix');
    assert.equal(assetIdFromSrc(`/images/landen/og-${id}.jpg`), id, 'og-prefix');
    assert.equal(assetIdFromSrc(`http://cms.vinomartino.com/assets/${id}?width=1600`), id);
    assert.equal(assetIdFromSrc('/images/auteurs/marijn.svg'), null);
    assert.equal(assetIdFromSrc(null), null);
});

test('synthetische ids worden herkend, echte foto niet', async () => {
    await withDirectusEnv(async () => {
        const mod = await loadSynth();
        stubFetch(() => jsonResponse([ART92_HERO, ECHTE_FOTO]));
        const ids = await mod.loadSyntheticImageIds();
        assert.equal(mod.isSyntheticImage(ids, ART92_HERO.id), true);
        assert.equal(mod.isSyntheticImage(ids, ECHTE_FOTO.id), false);
        // Hoofdletters in de UUID mogen niet stil door de mand vallen.
        assert.equal(mod.isSyntheticImage(ids, ART92_HERO.id.toUpperCase()), true);
        // Zonder file-id moet de src het werk doen.
        assert.equal(mod.isSyntheticImage(ids, null, `/images/articles/${ART92_HERO.id}.jpg`), true);
    });
});

test('de DAM wordt één keer per build gelezen', async () => {
    await withDirectusEnv(async () => {
        const mod = await loadSynth();
        const calls = stubFetch(() => jsonResponse([ART92_HERO, ECHTE_FOTO]));
        await Promise.all([mod.loadSyntheticImageIds(), mod.loadSyntheticImageIds()]);
        await mod.loadSyntheticImageIds();
        assert.equal(calls.length, 1, '/files?limit=-1 is ~765 rijen — per pagina opnieuw ophalen sloopt de build (LAT-2779/LAT-3319)');
    });
});

test('een 403 op directus_files breekt de productie-build', async () => {
    await withDirectusEnv(async () => {
        const mod = await loadSynth();
        stubFetch(() => new Response('{"errors":[{"message":"forbidden"}]}', { status: 403, headers: { 'content-type': 'application/json' } }));
        await assert.rejects(
            () => mod.loadSyntheticImageIds(),
            /directus_files/,
            'zonder DAM-metadata weet de build niet wélk beeld synthetisch is; stil publiceren zou de §7-disclosure geruisloos laten verdwijnen',
        );
    });
});

test('0 bestanden telt als kapotte query, niet als "geen AI-beeld"', async () => {
    await withDirectusEnv(async () => {
        const mod = await loadSynth();
        stubFetch(() => jsonResponse([]));
        await assert.rejects(() => mod.loadSyntheticImageIds(), /directus_files/);
    });
});

test('een mislukte load blijft niet in de cache plakken', async () => {
    await withDirectusEnv(async () => {
        const mod = await loadSynth();
        stubFetch((_url, _init, n) =>
            n === 1
                ? new Response('nope', { status: 403 })
                : jsonResponse([ART92_HERO, ECHTE_FOTO]),
        );
        await assert.rejects(() => mod.loadSyntheticImageIds());
        const ids = await mod.loadSyntheticImageIds();
        assert.equal(mod.isSyntheticImage(ids, ART92_HERO.id), true, 'een gecachete mislukking zou de disclosure de rest van de build uitzetten');
    });
});
