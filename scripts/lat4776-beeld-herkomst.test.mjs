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

test('DESIGN_GUIDELINES §7 schrijft de badge-naam nergens meer voor (LAT-4795)', () => {
    // Het doc is de bron waaruit dit defect vier keer opnieuw ontstond: §7 zei
    // "badge Redactiegids", iemand implementeerde of verruimde daarop, en de
    // detector ging blind. PR #269 herschreef de toepassingsregel maar liet de
    // "Toegestaan"-opsomming staan — vandaar deze guard i.p.v. nóg een fix.
    const doc = readFileSync('DESIGN_GUIDELINES.md', 'utf8').split('\n');
    const start = doc.findIndex((l) => /^##\s*7\./.test(l));
    assert.notEqual(start, -1, '§7-kop niet gevonden — is DESIGN_GUIDELINES.md hernummerd?');
    const rest = doc.slice(start + 1).findIndex((l) => /^##\s/.test(l));
    const sectie = doc.slice(start, rest === -1 ? doc.length : start + 1 + rest);

    const hits = sectie
        .map((regel, i) => ({ regel, nr: start + 1 + i }))
        .filter(({ regel }) => /redactiegids/i.test(regel));

    // Falsifieerbaar in beide richtingen: de historische noot MOET er staan
    // (anders slaagt deze test ook als iemand heel §7 weggooit), en er mag
    // verder niets zijn dat het label voorschrijft.
    assert.ok(
        hits.some(({ regel }) => regel.startsWith('>')),
        'de historische noot die uitlegt dat "Redactiegids" de verkeerde naam was is verdwenen',
    );
    const voorschrijvend = hits.filter(({ regel }) => !regel.startsWith('>'));
    assert.deepEqual(
        voorschrijvend.map(({ nr, regel }) => `${nr}: ${regel.trim()}`),
        [],
        'buiten de historische noot (blockquote) mag §7 het woord "Redactiegids" niet noemen — ' +
            'dat label is reisprovenance uit articles.zelf_gereisd en staat op 73 van de 77 ' +
            'artikelen, óók bij echte foto\'s (LAT-4713 → 4725 → 4729 → 4761 → 4776 → 4795)',
    );
});

test('de machineleesbare marker komt door de detector-regex', async () => {
    const { SYNTHETIC_MARKER_ATTR } = await loadSynth();
    assert.match(
        `data-beeldherkomst="${SYNTHETIC_MARKER_ATTR}"`,
        new RegExp(DETECTOR_RE_SOURCE, 'i'),
        'het data-attribuut is de enige disclosure die de detector op /en/-paginas ziet',
    );
});

test('het component rendert géén tweede <figcaption> in de hero-figure', () => {
    const src = readFileSync('src/components/BeeldHerkomst.astro', 'utf8');
    const markup = src.slice(src.indexOf('---', src.indexOf('---') + 3));
    assert.doesNotMatch(
        markup,
        /<figcaption/,
        'elke hero-<figure> waar dit component in hangt heeft al een figcaption voor de licentie-credit; ' +
            'een <figure> mag er maar één bevatten en de tweede wordt niet betrouwbaar geparsed',
    );
    assert.match(markup, /data-beeldherkomst=/, 'de machineleesbare marker moet in de markup staan');
});

// ── LAT-5467 — kaart-/thumbnailrenders dragen dezelfde marker ────────────────
//
// LAT-4776 bond de disclosure aan het BESTAND, maar rendert hem alleen in de
// hero-<figure> van de detailpagina. Op /, /artikelen/, /streken/ en /landen/*
// staat hetzelfde bestand als kaart-thumbnail zónder marker. Dat werd vier keer
// opgevangen met een per-bestand `disclosed_elsewhere`-ack; elk nieuw AI-hero-
// artikel voegde er 2+ regels aan toe. Deze tests zijn de rem daarop: ze falen
// als een kaartrender de marker verliest of als er een nieuwe bijkomt zonder.

/** Markup-helft (na de tweede `---`) van een .astro-bestand. */
function astroMarkup(path) {
    const src = readFileSync(path, 'utf8');
    return src.slice(src.indexOf('---', src.indexOf('---') + 3));
}

/** Alle `<img …>`-tags in een stuk markup, als losse strings. */
function imgTags(markup) {
    return markup.match(/<img\b[^>]*>/g) || [];
}

test('syntheticImageAttrs geeft het attribuut alleen voor AI-beeld', async () => {
    const { syntheticImageAttrs, SYNTHETIC_MARKER_ATTR, SYNTHETIC_MARKER_DATA_ATTR } = await loadSynth();
    const ids = new Set([ART92_HERO.id]);

    assert.deepEqual(syntheticImageAttrs(ids, ART92_HERO.id), {
        [SYNTHETIC_MARKER_DATA_ATTR]: SYNTHETIC_MARKER_ATTR,
    });
    // Zonder los file-id moet de UUID uit de gebuildde src komen — zo werkt het
    // op de kaarten, die alleen `/images/<map>/<uuid>.jpg` bij de hand hebben.
    assert.deepEqual(syntheticImageAttrs(ids, null, `/images/articles/${ART92_HERO.id}.jpg`), {
        [SYNTHETIC_MARKER_DATA_ATTR]: SYNTHETIC_MARKER_ATTR,
    });
    // Een echte foto krijgt niets: het spreiden van {} mag de <img> niet raken.
    assert.deepEqual(syntheticImageAttrs(ids, ECHTE_FOTO.id), {});
    assert.deepEqual(syntheticImageAttrs(ids, null, '/images/auteurs/marijn.svg'), {});
    assert.deepEqual(syntheticImageAttrs(ids, null, null), {});

    // Het attribuut dat de kaarten uitzenden moet door de detector-regex komen,
    // anders is de hele render-fix onzichtbaar voor de meting.
    assert.match(
        `${SYNTHETIC_MARKER_DATA_ATTR}="${SYNTHETIC_MARKER_ATTR}"`,
        new RegExp(DETECTOR_RE_SOURCE, 'i'),
    );
});

test('SmartImg — het gedeelde kaartbeeld draagt de marker', () => {
    const path = 'src/components/SmartImg.astro';
    const markup = astroMarkup(path);
    const tags = imgTags(markup);

    assert.equal(tags.length, 1, `${path} hoort precies één <img> te hebben; pas deze guard aan als dat verandert`);
    assert.match(
        tags[0],
        /\{\.\.\.herkomst\}/,
        'SmartImg is het kaartbeeld van /artikelen/, /streken/, /landen/* en /accommodaties/. ' +
            'Zonder de marker vallen al die overzichten terug op per-bestand acks in lat4745-acks.json — ' +
            'precies de hardgecodeerde scope uit LAT-4713 → 4725 → 4729 → 4761 (LAT-5467).',
    );
    assert.match(
        readFileSync(path, 'utf8'),
        /syntheticImageAttrs/,
        'SmartImg moet de marker uit synthetic-images afleiden, niet uit een eigen lijst',
    );
    // Een kaart-<figure> draagt al een figcaption voor de licentie-credit; er
    // mag er maar één zijn. Het attribuut is genoeg — zie LAT-5467.
    assert.doesNotMatch(markup, /<figcaption/, 'een kaart hoort geen tweede bijschrift te krijgen');
});

test('HomeContent — elke kaart-<img> met een contentbeeld draagt de marker', () => {
    // De homepage rendert haar kaarten met een rauwe <img> i.p.v. SmartImg, dus
    // de marker moet daar per tag mee. Deze test is de vangrail voor een
    // NIEUWE kaart: hij leidt de scope af uit de markup zelf i.p.v. uit een
    // lijst van vier bekende regels.
    const path = 'src/components/HomeContent.astro';
    const tags = imgTags(astroMarkup(path));
    assert.ok(tags.length >= 4, `verwacht meerdere <img> in ${path}, gevonden ${tags.length}`);

    // Een contentbeeld herken je aan een src die uit een data-object komt
    // (`streek.image`, `article.heroImage`, …). Statische paden en constants
    // (`HERO_IMAGE`, "/over-ons-hero.jpg") staan niet in de DAM en zijn exempt.
    const contentImgs = tags.filter((t) => /\bsrc=\{[A-Za-z_$][\w$]*\.[\w$.]+\}/.test(t));
    assert.ok(
        contentImgs.length >= 4,
        `verwacht >=4 contentbeeld-<img> in ${path} (streek-tegel, route-kaart, spotlight, artikelkaart), ` +
            `gevonden ${contentImgs.length} — is de markup herschreven?`,
    );

    const zonderMarker = contentImgs.filter((t) => !/\{\.\.\.herkomst\(/.test(t));
    assert.deepEqual(
        zonderMarker,
        [],
        'elke <img> op de homepage die een Directus-beeld toont moet {...herkomst(<src>)} spreiden, ' +
            'anders staat AI-beeld daar ongemarkeerd en groeit lat4745-acks.json weer per artikel (LAT-5467)',
    );

    // Falsifieerbaarheid in de andere richting: de statische hero/portret mogen
    // NIET meegenomen zijn, anders test de filter hierboven niets.
    const statisch = tags.filter((t) => /src=\{HERO_IMAGE\}|src="\//.test(t));
    assert.ok(statisch.length >= 2, 'de statische hero en het portret horen buiten de contentbeeld-scope te vallen');
    assert.equal(
        statisch.filter((t) => contentImgs.includes(t)).length,
        0,
        'de contentbeeld-filter vangt ook statische paden — dan bewijst hij niets over de kaarten',
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
