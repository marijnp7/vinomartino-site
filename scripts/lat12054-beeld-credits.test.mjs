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

test('LAT-13760: wijnhuisbeeld met toestemming krijgt "© <huis>" met link naar het huis, zonder licentielink', async () => {
    const { creditFromFileMeta, licenseLabelFor } = await loadModule('credits-perm', 'src/lib/image-credits.ts');
    const h = 'Foto: Pio Cesare. Bron: https://www.piocesare.it (toestemming wijnhuis 06-10-2026, redactioneel gebruik, geen AI-bewerking).';
    for (const lic of ['toestemming-wijnhuis', 'pers']) {
        const c = creditFromFileMeta(lic, h);
        assert.equal(c.author, '© Pio Cesare');
        assert.equal(c.licenseUrl, '');
        assert.equal(c.sourceUrl, 'https://www.piocesare.it');
        assert.equal(c.sourceLabel, 'piocesare.it');
    }
    assert.equal(licenseLabelFor('met toestemming', 'en'), 'with permission');
    assert.equal(creditFromFileMeta('pers', null), null, 'zonder maker geen credit');
    assert.equal(creditFromFileMeta('eigen', h), null, 'overige licenties ongewijzigd');
});

test('LAT-13914: CC-credit toont "Foto: <maker>" (EN "Photo:") zonder ©; Castiglione-herkomst geeft Christoph Strässler', async () => {
    const { creditFromFileMeta, creditAuthorFor } = await loadModule('lat13914', 'src/lib/image-credits.ts');
    const herkomst = 'Slug: langhe-vier-dagen-route\nArtikel-id: 54\nLicentie: CC BY-SA 2.0\nFoto: Christoph Strässler, CC BY-SA 2.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Castiglione_Falletto,_Piemonte,_Italy.jpg\nKeywords: vinomartino, editorial, CC-license, Piemonte, Langhe, Castiglione Falletto,';
    const c = creditFromFileMeta('cc-by-sa-2.0', herkomst);
    assert.equal(c.author, '© Christoph Strässler');
    assert.equal(c.licenseLabel, 'CC BY-SA 2.0');
    assert.equal(c.licenseUrl, 'https://creativecommons.org/licenses/by-sa/2.0/');
    assert.equal(c.sourceUrl, 'https://commons.wikimedia.org/wiki/File:Castiglione_Falletto,_Piemonte,_Italy.jpg');
    assert.equal(c.sourceLabel, 'Wikimedia Commons');
    assert.equal(creditAuthorFor(c, 'nl'), 'Foto: Christoph Strässler');
    assert.equal(creditAuthorFor(c, 'en'), 'Photo: Christoph Strässler');
    const perm = creditFromFileMeta('pers', 'Foto: Pio Cesare. Bron: https://www.piocesare.it');
    assert.equal(creditAuthorFor(perm, 'nl'), 'Foto: Pio Cesare', 'REGEL 64: ook toestemming-credit noemt Foto');
});

test('LAT-12364: cc-by-2.5 en cc-by-nd-2.0 krijgen een credit (art. 82 en 89 renderden zonder)', async () => {
    const { creditFromFileMeta, creditAuthorFor } = await loadModule('lat12364', 'src/lib/image-credits.ts');
    const by25 = creditFromFileMeta('cc-by-2.5', 'Foto: onbekende maker, CC BY 2.5, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File%3APened%C3%A8s_montserrat01.jpg. Teruggevonden via SHA1 op 29-09-2026.');
    assert.equal(by25.licenseLabel, 'CC BY 2.5');
    assert.equal(by25.licenseUrl, 'https://creativecommons.org/licenses/by/2.5/');
    assert.equal(by25.sourceUrl, 'https://commons.wikimedia.org/wiki/File%3APened%C3%A8s_montserrat01.jpg');
    const nd = creditFromFileMeta('cc-by-nd-2.0', 'Wijngaardrijen op de meseta bij Gumiel de Mercado (Burgos), DO Ribera del Duero — zandpad, solitaire steeneik, avondlicht. Foto: CRDO Ribera del Duero, CC BY-ND 2.0 (https://creativecommons.org/licenses/by-nd/2.0/). Bron: officiele beeldbank van het DO-consortium via Flickr, https://www.flickr.com/photos/riberadelduero/8073819483 — origineel 5120x2039, opname 2009-09-09, camera Canon EOS 400D (EXIF bewaard). DAM ref 2079. Echte fotografie, niet gegenereerd; ND-clausule: uitsluitend mechanisch geschaald, niet bewerkt. Geplaatst via LAT-4804.');
    assert.equal(nd.licenseLabel, 'CC BY-ND 2.0');
    assert.equal(nd.licenseUrl, 'https://creativecommons.org/licenses/by-nd/2.0/');
    assert.equal(creditAuthorFor(nd, 'nl'), 'Foto: CRDO Ribera del Duero');
    assert.equal(nd.sourceUrl, 'https://www.flickr.com/photos/riberadelduero/8073819483', 'bron is Flickr, niet de licentie-URL');
    assert.equal(nd.sourceLabel, 'Flickr');
    for (const v of ['2.0', '2.5', '3.0', '4.0']) assert.ok(creditFromFileMeta(`cc-by-nd-${v}`, null), `cc-by-nd-${v}`);
});

// LAT-14310: the supplied resort image needs the agreed visible house credit in both languages.
test('permission image: Foto/Photo credit and source link derive from DAM metadata', async () => {
    const { creditFromFileMeta, creditAuthorFor } = await loadModule('credits', 'src/lib/image-credits.ts');
    const credit = creditFromFileMeta('pers', 'Foto: Marchesi Mazzei. Bron: https://www.mazzei.it');
    assert.equal(creditAuthorFor(credit, 'nl'), 'Foto: Marchesi Mazzei');
    assert.equal(creditAuthorFor(credit, 'en'), 'Photo: Marchesi Mazzei');
    assert.equal(credit.sourceUrl, 'https://www.mazzei.it');
});

test('LAT-14452: hoteltoestemming toont de afgesproken credit op de NL- en EN-kaart (EN: Photo:, LAT-14520)', async () => {
    const { creditFromFileMeta, creditAuthorFor, isHouseSuppliedLicense } = await loadModule('lat14452', 'src/lib/image-credits.ts');
    const credit = creditFromFileMeta(
        'toestemming accommodatie',
        'Foto: Hotel Altes Winzerhaus | Bron: https://alteswinzerhaus-cochem.de/ (alleen redactioneel; LAT-14386)',
    );
    assert.equal(isHouseSuppliedLicense('toestemming accommodatie'), true);
    assert.equal(creditAuthorFor(credit, 'nl'), 'Foto: Hotel Altes Winzerhaus');
    // LAT-14520: EN krijgt het Engelse voorvoegsel; naam en bronlink blijven.
    assert.equal(creditAuthorFor(credit, 'en'), 'Photo: Hotel Altes Winzerhaus');
    assert.equal(credit.sourceUrl, 'https://alteswinzerhaus-cochem.de/');
    assert.equal(credit.licenseLabel, 'met toestemming');
});
