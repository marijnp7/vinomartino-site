/**
 * LAT-4907 — `og:image:width`/`og:image:height` moeten het geserveerde bestand
 * beschrijven.
 *
 * Waarom deze test bestaat
 * ------------------------
 * SiteLayout zette de twee tags als literals `1200`/`630` — de maat van
 * `og-default.png`. Zodra een pagina een echt beeld had, declareerde diezelfde
 * regel dus een verkeerde ratio. Op 2026-08-11 gemeten over de live sitemap:
 * **511 van de 555 URLs** declareerden een maat die niet met het bestand
 * overeenkwam (o.a. 1600×637, 1600×1067, 1600×2400 — allemaal als 1200×630).
 * Niets in de HTML verraadt dat; alleen de scraper aan de andere kant reserveert
 * het verkeerde vlak. Precies die stilte maakt het testbaar in plaats van iets
 * dat je bij de volgende wijziging vanzelf opmerkt.
 *
 * De meting zelf is het risico: een SOF-scanner die op de verkeerde marker
 * aanslaat geeft plausibele-maar-foute getallen, en dat is niet beter dan de
 * literal. Daarom meet elke test tegen `sharp` als onafhankelijk orakel, en
 * bewijst de eerste test eerst dat de fixture de oude literal zóu betrappen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';

// Node ≥22 strip-types: we importeren de live implementatie, geen nagetypte kopie.
import {
    getPublicImageDimensions,
    readImageDimensions,
    readJpegDimensions,
    readPngDimensions,
} from '../src/lib/og-image-dimensions.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = readFileSync(resolve(REPO, 'src/layouts/SiteLayout.astro'), 'utf8');

/** Kleurruis, zodat de JPEG-encoder echte SOF/DHT-segmenten produceert. */
function noise(width, height) {
    const buf = Buffer.alloc(width * height * 3);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 37 + (i % 511)) & 0xff;
    return sharp(buf, { raw: { width, height, channels: 3 } });
}

test('de fixture zou de oude 1200x630-literal betrappen', async () => {
    // Falsifieerbaarheid eerst: is de fixture per ongeluk 1200×630, dan bewijst
    // geen enkele assertie hieronder nog iets.
    const jpeg = await noise(1600, 637).jpeg().toBuffer();
    const truth = await sharp(jpeg).metadata();
    assert.equal(truth.width, 1600);
    assert.equal(truth.height, 637);
    assert.notDeepEqual(
        { width: truth.width, height: truth.height },
        { width: 1200, height: 630 },
        'de fixture heeft de maat van de oude literal en kan die dus niet betrappen',
    );
    // Dit is de maat die LAT-4907 op productie meette voor de Ribera-hero.
    assert.deepEqual(readJpegDimensions(jpeg), { width: 1600, height: 637 });
});

test('baseline en progressieve JPEG geven dezelfde afmetingen', async () => {
    // Progressief is SOF2 in plaats van SOF0; een scanner die alleen op 0xC0
    // aanslaat meet hier niets en valt stil terug op "geen tags".
    for (const progressive of [false, true]) {
        const jpeg = await noise(1501, 999).jpeg({ progressive }).toBuffer();
        const truth = await sharp(jpeg).metadata();
        assert.deepEqual(
            readJpegDimensions(jpeg),
            { width: truth.width, height: truth.height },
            `progressive=${progressive} wordt niet correct gemeten`,
        );
    }
});

test('een JPEG met een dikke EXIF/ICC-kop wordt nog steeds gemeten', async () => {
    // Segmenten vóór de SOF moeten op lengte worden overgeslagen; telt de
    // scanner de lengtebytes verkeerd, dan loopt hij de SOF voorbij.
    const icc = readFileSync(resolve(REPO, 'public/og-default.png')); // willekeurige payload-bron
    const jpeg = await noise(800, 1200)
        .withMetadata({ icc: undefined, exif: { IFD0: { Copyright: 'x'.repeat(2000) } } })
        .jpeg()
        .toBuffer();
    assert.ok(jpeg.length > icc.length / 4);
    const truth = await sharp(jpeg).metadata();
    assert.deepEqual(readJpegDimensions(jpeg), { width: truth.width, height: truth.height });
});

test('PNG wordt uit de IHDR-chunk gelezen', async () => {
    const png = await noise(1200, 630).png().toBuffer();
    assert.deepEqual(readPngDimensions(png), { width: 1200, height: 630 });
    assert.deepEqual(readImageDimensions(png), { width: 1200, height: 630 });
    // Een PNG mag niet per ongeluk door de JPEG-tak gemeten worden.
    assert.equal(readJpegDimensions(png), null);
});

test('onmeetbare invoer geeft null in plaats van een gok', async () => {
    // SVG staat live als og:image op minstens één pagina (/images/auteurs/marijn.svg);
    // een gok daar zou weer een foute declaratie zijn.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="99" height="99"/>');
    assert.equal(readImageDimensions(svg), null);
    assert.equal(readImageDimensions(Buffer.alloc(0)), null);
    assert.equal(readImageDimensions(Buffer.from('niet een beeld')), null);
    // Een JPEG-SOI zonder verdere segmenten mag niet blijven hangen.
    assert.equal(readJpegDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xff, 0xff])), null);
});

test('getPublicImageDimensions meet het bestand dat we werkelijk serveren', async () => {
    // og-default.png is gecommit; deze maat is wat de 40 fallback-pagina's
    // declareren en moet gelijk blijven aan wat sharp in het bestand ziet.
    const truth = await sharp(readFileSync(resolve(REPO, 'public/og-default.png'))).metadata();
    assert.deepEqual(await getPublicImageDimensions('/og-default.png'), {
        width: truth.width,
        height: truth.height,
    });
});

test('getPublicImageDimensions weigert paden buiten public/ en externe URLs', async () => {
    assert.equal(await getPublicImageDimensions(null), null);
    assert.equal(await getPublicImageDimensions('/bestaat-niet-4907.jpg'), null);
    assert.equal(await getPublicImageDimensions('https://example.com/x.jpg'), null);
    assert.equal(await getPublicImageDimensions('//example.com/x.jpg'), null);
    assert.equal(await getPublicImageDimensions('/../package.json'), null);
});

test('SiteLayout declareert de afmetingen niet meer als literal', () => {
    // Bindt aan de live code: komt de literal terug, dan breekt dit.
    assert.doesNotMatch(
        LAYOUT,
        /og:image:(width|height)" content="\d+"/,
        'og:image:width/height staat weer als vast getal in SiteLayout — dat is precies het defect van LAT-4907',
    );
    assert.match(
        LAYOUT,
        /const measuredOgImage = await getPublicImageDimensions\(ogImageSourcePath\);/,
        'SiteLayout meet het og-beeld niet meer',
    );
    assert.match(
        LAYOUT,
        // LAT-4988: de keten kan nu ook op de default uitkomen doordat het eigen beeld
        // een SVG is. De meting moet die afslag volgen, anders declareren we de maat
        // van een beeld dat we niet serveren — precies het defect van LAT-4907.
        /const ogImageSourcePath = \(validPageOgImageUrl \? ogImage : DEFAULT_OG_IMAGE\) \?\? DEFAULT_OG_IMAGE;/,
        'de gemeten bron volgt niet de og:image-keten (og_image → hero → default)',
    );
    assert.match(
        LAYOUT,
        /\{hasOgImageDimensions && \(/,
        'de tags worden niet meer weggelaten wanneer de afmetingen onbekend zijn',
    );
});
