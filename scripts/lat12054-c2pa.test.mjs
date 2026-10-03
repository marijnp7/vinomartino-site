/**
 * LAT-12054 — een asset met C2PA-manifest dat niet als synthetisch in de DAM staat, faalt de productiebuild.
 * Draait het echte CLI tegen een nep-Directus (node:http) en een tijdelijke images-map.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hasC2paManifest, findUndeclaredC2pa } from './check-c2pa.mjs';

const script = fileURLToPath(new URL('./check-c2pa.mjs', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'lat12054-c2pa-'));
test.after(() => rmSync(workDir, { recursive: true, force: true }));

const ID_C2PA_ONGEVLAGD = '11111111-1111-1111-1111-111111111111';
const ID_C2PA_GEVLAGD = '22222222-2222-2222-2222-222222222222';
const ID_SCHOON = '33333333-3333-3333-3333-333333333333';
const ID_LAAT = '44444444-4444-4444-4444-444444444444';

const jpeg = (marker, offset = 100) => {
    const b = Buffer.alloc(600 * 1024, 0x41);
    if (marker) Buffer.from(marker).copy(b, offset);
    return b;
};
const assets = {
    [ID_C2PA_ONGEVLAGD]: jpeg('jumb\0c2pa'),
    [ID_C2PA_GEVLAGD]: jpeg('jumb\0c2pa'),
    [ID_SCHOON]: jpeg(null),
    [ID_LAAT]: jpeg('c2pa', 450 * 1024), // buiten de eerste 400 KB
};
const dam = [
    { id: ID_C2PA_ONGEVLAGD, title: 'Chateau X', synthetisch: false },
    { id: ID_C2PA_GEVLAGD, title: 'Chateau Y', synthetisch: true },
    { id: ID_SCHOON, title: 'Chateau Z', synthetisch: null },
    { id: ID_LAAT, title: 'Chateau W', synthetisch: null },
];

async function withServer(fn) {
    const server = createServer((req, res) => {
        if (req.url.startsWith('/files')) {
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify({ data: dam }));
        }
        const m = /\/assets\/([0-9a-f-]{36})/.exec(req.url);
        if (m && assets[m[1]]) {
            res.setHeader('content-type', 'image/jpeg');
            return res.end(assets[m[1]]); // negeert Range bewust: het script moet zelf afkappen
        }
        res.statusCode = 404;
        res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.close();
    }
}

function imagesDir(ids) {
    const dir = mkdtempSync(join(workDir, 'img-'));
    mkdirSync(join(dir, 'wijnhuizen'));
    for (const id of ids) writeFileSync(join(dir, 'wijnhuizen', `${id}.jpg`), 'x');
    return dir;
}

// Async spawn: het nep-Directus draait in dit proces, spawnSync zou zijn event-loop blokkeren.
const run = (url, dir, extraEnv = {}) =>
    new Promise((resolve) => {
        const child = spawn(process.execPath, [script, '--images-dir', dir], {
            env: { PATH: process.env.PATH, DIRECTUS_URL: url, DIRECTUS_TOKEN: 'test', ...extraEnv },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.on('close', (status) => resolve({ status, stdout, stderr }));
    });

test('hasC2paManifest ziet c2pa/jumb alleen in de eerste 400 KB', () => {
    assert.equal(hasC2paManifest(assets[ID_C2PA_ONGEVLAGD]), true);
    assert.equal(hasC2paManifest(assets[ID_SCHOON]), false);
    assert.equal(hasC2paManifest(assets[ID_LAAT]), false);
});

test('C2PA zonder synthetisch-vlag laat de productiebuild falen (exit 1) met de lijst bestanden', async () => {
    await withServer(async (url) => {
        const r = await run(url, imagesDir([ID_C2PA_ONGEVLAGD, ID_C2PA_GEVLAGD, ID_SCHOON, ID_LAAT]));
        console.log(`--- check-c2pa stdout/stderr (exit ${r.status}) ---\n${r.stdout}${r.stderr}`);
        assert.equal(r.status, 1);
        assert.match(r.stderr, new RegExp(ID_C2PA_ONGEVLAGD));
        assert.doesNotMatch(r.stderr, new RegExp(ID_C2PA_GEVLAGD), 'wél gevlagd in de DAM: mag niet falen');
        assert.doesNotMatch(r.stderr, new RegExp(ID_SCHOON));
    });
});

test('met synthetisch=true in de DAM slaagt de check (exit 0)', async () => {
    await withServer(async (url) => {
        const r = await run(url, imagesDir([ID_C2PA_GEVLAGD, ID_SCHOON, ID_LAAT]));
        assert.equal(r.status, 0, r.stderr);
    });
});

test('preview-build (DIRECTUS_INCLUDE_DRAFTS=1) waarschuwt maar faalt niet', async () => {
    await withServer(async (url) => {
        const r = await run(url, imagesDir([ID_C2PA_ONGEVLAGD]), { DIRECTUS_INCLUDE_DRAFTS: '1' });
        assert.equal(r.status, 0);
        assert.match(r.stderr, new RegExp(ID_C2PA_ONGEVLAGD));
    });
});

test('een onleesbaar asset faalt de productiebuild i.p.v. stil door te gaan', async () => {
    await withServer(async (url) => {
        const dir = imagesDir(['99999999-9999-9999-9999-999999999999']);
        const r = await run(url, dir);
        assert.equal(r.status, 1);
    });
});

test('zonder DIRECTUS_URL kan de check niet draaien (exit 2, productie)', async () => {
    const r = await run('', imagesDir([ID_SCHOON]));
    assert.equal(r.status, 2);
});

test('findUndeclaredC2pa slaat gevlagde bestanden over zonder ze op te halen', async () => {
    const fetched = [];
    const fetchImpl = async (u) => {
        fetched.push(u);
        return new Response(assets[ID_SCHOON], { status: 200 });
    };
    const r = await findUndeclaredC2pa({
        ids: new Map([[ID_C2PA_GEVLAGD, 'a'], [ID_SCHOON, 'b']]),
        metaById: new Map(dam.map((d) => [d.id, d])),
        directusUrl: 'http://x',
        token: 't',
        fetchImpl,
    });
    assert.equal(fetched.length, 1);
    assert.equal(r.undeclared.length, 0);
});
