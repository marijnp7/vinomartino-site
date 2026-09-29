/**
 * LAT-12054 — <picture> met AVIF/WebP + JPG-fallback, srcset 640/1024/1600, hero = fetchpriority high.
 * Draait optimize-images op een tijdelijke dist/ met echte JPG's.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeDist, rewriteHtml, widthsFor, MAX_BYTES } from './optimize-images.mjs';

const workDir = mkdtempSync(join(tmpdir(), 'lat12054-picture-'));
test.after(() => rmSync(workDir, { recursive: true, force: true }));

async function noisyJpeg(w, h) {
    // Verloop met matige ruis: zwaar genoeg voor >400 KB bij q95, maar comprimeert als een echte foto.
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 3;
            const noise = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 24;
            raw[i] = ((x * 255) / w + noise) & 255;
            raw[i + 1] = ((y * 255) / h + noise) & 255;
            raw[i + 2] = (((x + y) * 128) / (w + h) + noise) & 255;
        }
    }
    return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

test('widthsFor: nooit upscalen, altijd de bronbreedte als top', () => {
    assert.deepEqual(widthsFor(2400), [640, 1024, 1600]);
    assert.deepEqual(widthsFor(1200), [640, 1024, 1200]);
    assert.deepEqual(widthsFor(500), [500]);
});

test('optimizeDist maakt varianten, houdt alles <= 400 KB en wikkelt <img> in <picture>', async () => {
    const dist = join(workDir, 'dist');
    mkdirSync(join(dist, 'images', 'wijnhuizen'), { recursive: true });
    const big = await noisyJpeg(1800, 1200);
    assert.ok(big.length > MAX_BYTES, 'fixture moet zwaarder zijn dan 400 KB');
    writeFileSync(join(dist, 'images', 'wijnhuizen', 'hero-1.jpg'), big);
    writeFileSync(join(dist, 'images', 'wijnhuizen', 'kaart-2.jpg'), await noisyJpeg(900, 600));
    writeFileSync(
        join(dist, 'index.html'),
        '<html><body>' +
            '<img src="/images/wijnhuizen/hero-1.jpg" alt="a > b" class="wh-hero__img" loading="eager">' +
            '<img src="/images/wijnhuizen/kaart-2.jpg" alt="kaart" width="600" height="450">' +
            '<img src="/logo.svg" alt="logo">' +
            '<picture><img src="/images/wijnhuizen/kaart-2.jpg" alt="al gewikkeld"></picture>' +
            '</body></html>',
    );

    const r = await optimizeDist(dist, join(workDir, 'cache'));
    assert.equal(r.images, 2);
    assert.deepEqual(r.oversize, []);
    for (const f of ['hero-1.w640.avif', 'hero-1.w1024.webp', 'hero-1.w1600.avif', 'hero-1.w640.jpg', 'kaart-2.w900.avif', 'kaart-2.w640.webp']) {
        assert.ok(existsSync(join(dist, 'images', 'wijnhuizen', f)), f);
    }
    for (const f of ['hero-1.jpg', 'hero-1.w640.jpg', 'hero-1.w1600.avif', 'kaart-2.jpg']) {
        assert.ok(statSync(join(dist, 'images', 'wijnhuizen', f)).size <= MAX_BYTES, `${f} <= 400 KB`);
    }
    const md = await sharp(join(dist, 'images', 'wijnhuizen', 'hero-1.jpg')).metadata();
    assert.equal(md.width, 1600);

    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    assert.match(html, /<source type="image\/avif" srcset="\/images\/wijnhuizen\/hero-1\.w640\.avif 640w, \/images\/wijnhuizen\/hero-1\.w1024\.avif 1024w, \/images\/wijnhuizen\/hero-1\.w1600\.avif 1600w"/);
    assert.match(html, /<source type="image\/webp"/);
    assert.match(html, /srcset="\/images\/wijnhuizen\/hero-1\.w640\.jpg 640w, \/images\/wijnhuizen\/hero-1\.w1024\.jpg 1024w, \/images\/wijnhuizen\/hero-1\.jpg 1600w"/);
    assert.match(html, /alt="a > b"[^>]*fetchpriority="high"/, 'hero: fetchpriority=high');
    assert.match(html, /alt="kaart" width="600" height="450"[^>]*loading="lazy"/, 'rest: lazy');
    assert.equal((html.match(/<picture/g) || []).length, 3, 'logo.svg en bestaande <picture> blijven onaangeroerd');
    assert.doesNotMatch(html, /loading="lazy"[^>]*fetchpriority="high"/);

    // idempotent: tweede pass wikkelt niets dubbel
    const again = rewriteHtml(html, new Map([['/images/wijnhuizen/hero-1.jpg', { widths: [640, 1024, 1600] }]]));
    assert.equal(again.changed, 0);
});

test('een hero met class *hero* maar zonder loading-attribuut wordt eager + fetchpriority high', () => {
    const info = new Map([['/images/a.jpg', { widths: [640, 1024, 1600] }], ['/images/b.jpg', { widths: [640] }]]);
    const { html } = rewriteHtml(
        '<img src="/images/a.jpg" alt="x" class="article-hero-img"><img src="/images/b.jpg" alt="y">',
        info,
    );
    assert.match(html, /class="article-hero-img"[^>]*loading="eager" fetchpriority="high"/);
    assert.match(html, /alt="y"[^>]*loading="lazy"/);
    assert.equal((html.match(/fetchpriority/g) || []).length, 1, 'maar één hero per pagina');
});
