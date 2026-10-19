/**
 * LAT-14220 — de fallback-credit "Foto: <huis>" onder een wijnhuis-hero mag alleen bij beeld
 * dat het huis zelf aanleverde (`pers`/`toestemming-wijnhuis`), nooit onder eigen beeld.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const workDir = mkdtempSync(join(tmpdir(), 'lat14220-huiscredit-'));
test.after(() => rmSync(workDir, { recursive: true, force: true }));

async function loadCredits() {
    const outfile = join(workDir, `image-credits.${process.pid}.mjs`);
    await build({ entryPoints: ['src/lib/image-credits.ts'], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
    return import(`${outfile}?v=${Math.random()}`);
}

test('alleen door het huis aangeleverd beeld mag het huis crediteren', async () => {
    const { isHouseSuppliedLicense } = await loadCredits();
    for (const lic of ['pers', 'toestemming-wijnhuis', 'toestemming wijnhuis', ' Pers ']) {
        assert.equal(isHouseSuppliedLicense(lic), true, lic);
    }
    for (const lic of ['eigen', 'cc0', 'publiek-domein', 'cc-by-sa-4.0', 'onbekend', '', null, undefined]) {
        assert.equal(isHouseSuppliedLicense(lic), false, String(lic));
    }
});

test('isHouseSuppliedImage zonder file-id is false (geen credit)', async () => {
    const { isHouseSuppliedImage } = await loadCredits();
    assert.equal(await isHouseSuppliedImage(null), false);
    assert.equal(await isHouseSuppliedImage(''), false);
});

test('WijnhuisPageContent gate de "Foto: <huis>"-fallback op de DAM-licentie', () => {
    const src = readFileSync('src/components/pages/WijnhuisPageContent.astro', 'utf8');
    const fallbacks = [...src.matchAll(/\{([^{}]*)&&\s*\(\s*<figcaption class="wh-hero__credit">\{ui\.t\('wijnhuis\.reeks\.foto'\)\}/g)];
    assert.equal(fallbacks.length, 1, 'precies één fallback-figcaption verwacht');
    assert.match(fallbacks[0][1], /heroIsHouseSupplied/, 'fallback moet op heroIsHouseSupplied gaten');
    assert.match(src, /const heroIsHouseSupplied = await isHouseSuppliedImage\(heroImageId\)/);
});

test('spotlight en beeldreeks crediteren het huis ook alleen bij door het huis aangeleverd beeld', () => {
    const spot = readFileSync('src/components/WijnhuisSpotlight.astro', 'utf8');
    assert.match(spot, /isHouseSuppliedImage\(e\.huis\.heroImageId\)/);
    assert.match(spot, /\{huisBeeld\.has\(e\.huis\.slug\) && \(/);
    const reeks = readFileSync('src/components/WijnhuisPortretBlokken.astro', 'utf8');
    assert.match(reeks, /const huisBeeld = !p\.zelfGeweest && \(await isHouseSuppliedImage\(b\.id\)\)/);
    assert.match(reeks, /: huisBeeld \? `\$\{ui\.t\('wijnhuis\.reeks\.foto'\)\}: \$\{name\}`/);
});
