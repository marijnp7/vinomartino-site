/**
 * LAT-12054 — naamsvermelding en AI-vlag komen uit de DAM-metadata, niet uit een lijst in de code.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const workDir = mkdtempSync(join(tmpdir(), 'lat12054-credits-'));
test.after(() => rmSync(workDir, { recursive: true, force: true }));

async function loadModule(name, entry) {
    const outfile = join(workDir, `${name}.${process.pid}.mjs`);
    await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
    return import(`${outfile}?v=${Math.random()}`);
}

const HERKOMST = 'Foto: Pmau, CC BY-SA 4.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Vignoble_a_Spoy.jpg';

function withDam(rows, fn) {
    const prev = { url: process.env.DIRECTUS_URL, token: process.env.DIRECTUS_TOKEN, fetch: globalThis.fetch };
    process.env.DIRECTUS_URL = 'http://directus.test';
    process.env.DIRECTUS_TOKEN = 'test-token';
    delete process.env.DIRECTUS_INCLUDE_DRAFTS;
    delete process.env.ALLOW_CONTENT_DEGRADE;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ data: rows }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return Promise.resolve(fn(() => calls)).finally(() => {
        globalThis.fetch = prev.fetch;
        for (const [k, v] of [['DIRECTUS_URL', prev.url], ['DIRECTUS_TOKEN', prev.token]]) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    });
}

const row = (id, extra = {}) => ({ id, title: null, description: null, tags: null, filename_download: 'x.jpg', ...extra });

test('cc-by-sa-4.0: maker, licentie met link en bronpagina komen uit de DAM', async () => {
    await withDam([row('AAAAAAAA-0000-0000-0000-000000000001', { licentie: 'cc-by-sa-4.0', herkomst: HERKOMST })], async () => {
        const { getImageCredit } = await loadModule('credits', 'src/lib/image-credits.ts');
        const c = await getImageCredit('aaaaaaaa-0000-0000-0000-000000000001');
        assert.equal(c.author, '© Pmau');
        assert.equal(c.licenseLabel, 'CC BY-SA 4.0');
        assert.equal(c.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
        assert.equal(c.sourceUrl, 'https://commons.wikimedia.org/wiki/File:Vignoble_a_Spoy.jpg');
        assert.equal(c.sourceLabel, 'Wikimedia Commons');
    });
});

test('cc-by-2.0 en cc-by-3.0 krijgen de by-URL, niet by-sa', async () => {
    await withDam([
        row('bbbbbbbb-0000-0000-0000-000000000001', { licentie: 'cc-by-2.0', herkomst: 'Foto: Jan, CC BY 2.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:A.jpg' }),
        row('bbbbbbbb-0000-0000-0000-000000000002', { licentie: 'cc-by-3.0', herkomst: 'Foto: Piet, Jansen, CC BY 3.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:B.jpg' }),
    ], async () => {
        const { getImageCredit } = await loadModule('credits', 'src/lib/image-credits.ts');
        assert.equal((await getImageCredit('bbbbbbbb-0000-0000-0000-000000000001')).licenseUrl, 'https://creativecommons.org/licenses/by/2.0/');
        const c = await getImageCredit('bbbbbbbb-0000-0000-0000-000000000002');
        assert.equal(c.licenseUrl, 'https://creativecommons.org/licenses/by/3.0/');
        assert.equal(c.author, '© Piet, Jansen', 'een komma in de maker mag de parse niet breken');
    });
});

test('licenties zonder attributieplicht geven geen credit', async () => {
    const rows = ['cc0', 'publiek-domein', 'eigen', 'pexels', 'unsplash', 'booking-onbevestigd', 'pers-onbevestigd', 'onbekend', 'synthetisch']
        .map((l, i) => row(`cccccccc-0000-0000-0000-00000000000${i}`, { licentie: l, herkomst: HERKOMST }));
    await withDam(rows, async () => {
        const { getImageCredit } = await loadModule('credits', 'src/lib/image-credits.ts');
        for (const r of rows) assert.equal(await getImageCredit(r.id), null, r.licentie);
        assert.equal(await getImageCredit('dddddddd-0000-0000-0000-000000000000'), null, 'bestand niet in DAM');
        assert.equal(await getImageCredit(null), null);
    });
});

test('herkomst in afwijkende vorm degradeert naar maker + bron-URL', async () => {
    const { parseHerkomst } = await loadModule('credits', 'src/lib/image-credits.ts');
    const p = parseHerkomst('Foto: Gianni Careddu (CC BY-SA 4.0). Bron: https://commons.wikimedia.org/wiki/File:C.jpg');
    assert.equal(p.sourceUrl, 'https://commons.wikimedia.org/wiki/File:C.jpg');
    assert.match(p.maker, /^Gianni Careddu/);
});

test('adapted:true voor build-time gegradeerde kaartfoto', async () => {
    await withDam([row('eeeeeeee-0000-0000-0000-000000000001', { licentie: 'cc-by-sa-3.0', herkomst: HERKOMST })], async () => {
        const { getImageCredit } = await loadModule('credits', 'src/lib/image-credits.ts');
        assert.equal((await getImageCredit('eeeeeeee-0000-0000-0000-000000000001', { adapted: true })).adapted, true);
        assert.equal((await getImageCredit('eeeeeeee-0000-0000-0000-000000000001')).adapted, undefined);
    });
});

test('de code bevat geen vaste id-lijst (CREDITS) meer', () => {
    const src = readFileSync('src/lib/image-credits.ts', 'utf8');
    assert.doesNotMatch(src, /const CREDITS\b/);
    assert.doesNotMatch(src, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test('synthetisch=true zonder regex-treffer geeft AI-disclosure; false schakelt een regex-treffer niet uit', async () => {
    const rows = [
        row('ffffffff-0000-0000-0000-000000000001', { title: 'Chateau Foo', synthetisch: true }),
        row('ffffffff-0000-0000-0000-000000000002', { title: 'Chateau Bar', synthetisch: false }),
        row('ffffffff-0000-0000-0000-000000000003', { title: 'AI-gegenereerd beeld', synthetisch: false }),
        row('ffffffff-0000-0000-0000-000000000004', { title: 'Chateau Baz' }),
    ];
    await withDam(rows, async (calls) => {
        const mod = await loadModule('synthetic', 'src/lib/synthetic-images.ts');
        const ids = await mod.loadSyntheticImageIds();
        assert.equal(mod.isSyntheticImage(ids, rows[0].id), true, 'veld synthetisch=true');
        assert.equal(mod.isSyntheticImage(ids, rows[1].id), false);
        assert.equal(mod.isSyntheticImage(ids, rows[2].id), true, 'regex blijft gelden');
        assert.equal(mod.isSyntheticImage(ids, rows[3].id), false);
        await mod.loadSyntheticImageIds();
        assert.equal(calls(), 1, 'één DAM-read per build');
    });
});

test('de site-regex is gelijk aan die van de buildcheck', async () => {
    const { SYNTHETIC_META_RE } = await loadModule('synthetic', 'src/lib/synthetic-images.ts');
    const { SYNTHETIC_META_RE: fromCheck } = await import('./check-c2pa.mjs');
    assert.equal(fromCheck.source, SYNTHETIC_META_RE.source);
    assert.equal(fromCheck.flags, SYNTHETIC_META_RE.flags);
});
