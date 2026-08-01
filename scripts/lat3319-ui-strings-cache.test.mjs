/**
 * LAT-3319 — `loadUiStrings()` moet de dictionary per locale één keer ophalen.
 *
 * Waarom deze test bestaat
 * ------------------------
 * `loadUiStrings()` wordt per *pagina* aangeroepen. Zonder cache is dat één
 * Directus-fetch per EN-pagina (~300). Onder die buildload slaat Directus'
 * pressure-limiter aan en geeft `503`, waarna `fetchDirectusCollection` per
 * poging 2000 ms slaapt (LAT-2779). In deploy-run 30709928435 gebeurde dat 47x
 * en tikte de build tegen `timeout-minutes: 30` van deploy.yml aan — twee
 * opeenvolgende prod-deploys werden zo afgebroken.
 *
 * De tweede test is de belangrijke: een *mislukte* load mag niet blijven
 * plakken. `UI_STRING_EN` dekt maar 34 van de 433 keys, dus een gecachete
 * degradatie zou 399 keys in het Nederlands op /en/ zetten.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

// Eigen tmp-map: alle agents in deze container delen één /tmp onder dezelfde
// uid, dus een vaste bestandsnaam wordt stil door een andere run overschreven.
const workDir = mkdtempSync(join(tmpdir(), 'lat3319-uistrings-'));

/** Bundelt ui-strings.ts naar ESM zodat we het met een gestubde fetch kunnen laden. */
async function loadModule() {
    const outfile = join(workDir, `ui-strings.${process.pid}.mjs`);
    await build({
        entryPoints: ['src/lib/ui-strings.ts'],
        outfile,
        bundle: true,
        format: 'esm',
        platform: 'node',
        logLevel: 'silent',
    });
    // Cache-busting query: elke test wil een verse modulestate.
    return import(`${outfile}?v=${Math.random()}`);
}

function stubFetch(handler) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(String(url));
        return handler(String(url), init, calls.length);
    };
    return calls;
}

function okResponse(rows) {
    return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

const ROWS = [
    {
        key: 'artikelen.rubriek.regio-gidsen',
        translations: [{ languages_code: 'en', value: 'Region guides' }],
    },
];

test.beforeEach(() => {
    process.env.DIRECTUS_URL = 'http://directus.test';
    process.env.DIRECTUS_TOKEN = 'test-token';
});

test('EN-dictionary wordt maar één keer opgehaald, ook bij ~300 paginarenders', async () => {
    const { loadUiStrings } = await loadModule();
    const calls = stubFetch(() => okResponse(ROWS));

    // Sequentieel én parallel: een build rendert pagina's op beide manieren.
    const first = await loadUiStrings('en');
    const rest = await Promise.all(Array.from({ length: 300 }, () => loadUiStrings('en')));

    assert.equal(calls.length, 1, `verwacht 1 Directus-fetch, kreeg ${calls.length}`);
    assert.equal(first.t('artikelen.rubriek.regio-gidsen'), 'Region guides');
    for (const ui of rest) {
        assert.equal(ui.t('artikelen.rubriek.regio-gidsen'), 'Region guides');
    }
});

test('NL doet geen enkele fetch', async () => {
    const { loadUiStrings } = await loadModule();
    const calls = stubFetch(() => okResponse(ROWS));

    const ui = await loadUiStrings('nl');

    assert.equal(calls.length, 0);
    assert.equal(ui.t('artikelen.rubriek.regio-gidsen'), 'Regio-gidsen');
});

test('een mislukte load wordt NIET gecachet — de volgende pagina probeert opnieuw', async () => {
    const { loadUiStrings } = await loadModule();
    // Eerste poging: Directus onder druk (503 op elke retry). Daarna herstelt hij.
    let recovered = false;
    const calls = stubFetch(() => {
        if (recovered) return okResponse(ROWS);
        return new Response('under pressure', { status: 503 });
    });

    const degraded = await loadUiStrings('en');
    // 34-key fallback: de rubrieksleutel zit er wél in, maar de overige 399 niet.
    assert.equal(degraded.t('artikelen.rubriek.regio-gidsen'), 'Region guides');
    const afterFailure = calls.length;
    assert.ok(afterFailure > 0, 'eerste load moet Directus geprobeerd hebben');

    recovered = true;
    const healthy = await loadUiStrings('en');

    assert.ok(
        calls.length > afterFailure,
        'na een degradatie moet een volgende render Directus opnieuw proberen, niet de fallback vasthouden',
    );
    assert.equal(healthy.t('artikelen.rubriek.regio-gidsen'), 'Region guides');

    // ...en zodra het lukt, is het weer één fetch voor de rest van de build.
    const settled = calls.length;
    await Promise.all(Array.from({ length: 50 }, () => loadUiStrings('en')));
    assert.equal(calls.length, settled, 'een geslaagde load moet daarna wél gecachet blijven');
});

test.after(() => {
    rmSync(workDir, { recursive: true, force: true });
});
