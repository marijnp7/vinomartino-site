/**
 * LAT-4988 — `og:image` moet een raster-formaat zijn.
 *
 * Waarom deze test bestaat
 * ------------------------
 * Scrapers (Facebook, LinkedIn, X, Slack) renderen geen vector-beeld. Wijst
 * `og:image` naar een SVG, dan komt er niet een lelijke deelkaart uit maar
 * helemáál geen — en niets in de HTML verraadt dat. Precies dezelfde stilte als
 * bij LAT-4907/LAT-4755, dus dezelfde aanpak: vastleggen in een test.
 *
 * De aanleiding waren de auteurspagina's: de avatars zijn SVG (`marijn.svg`) en
 * werden door AuteurDetail/AuteursIndex als `ogImage` doorgegeven.
 *
 * De predicaat-tests draaien tegen de live implementatie (`src/lib/og-image-format.ts`,
 * via Node ≥22 strip-types), niet tegen een nagetypte kopie. De twee
 * bron-asserties daaronder bewaken dat SiteLayout de guard ook echt aanroept —
 * een correcte functie die niemand gebruikt repareert niets.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { isRasterImageFormat } from '../src/lib/og-image-format.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = readFileSync(resolve(REPO, 'src/layouts/SiteLayout.astro'), 'utf8');

test('raster-formaten komen door de guard', () => {
    for (const url of [
        '/images/articles/bordeaux.jpg',
        '/images/articles/bordeaux.jpeg',
        '/og-default.png',
        '/images/hero.webp',
        '/images/anim.gif',
        'https://vinomartino.com/images/hero.PNG',
        '/images/hero.png?v=2',
        '/images/hero.jpg#top',
    ]) {
        assert.equal(isRasterImageFormat(url), true, `${url} zou een geldige og:image moeten zijn`);
    }
});

test('SVG en andere niet-raster waarden worden geweigerd', () => {
    for (const url of [
        // De concrete aanleiding: auteurs-avatars.
        '/images/authors/marijn.svg',
        'https://vinomartino.com/images/authors/marijn.svg',
        '/images/authors/marijn.SVG',
        '/images/logo.svg?v=3',
        // Geen extensie: we weten niet wat de scraper krijgt, dus niet vertrouwen.
        '/images/hero',
        '/api/og',
        // Leeg/ontbrekend — SiteLayout geeft hier `undefined` door.
        '',
        null,
        undefined,
    ]) {
        assert.equal(isRasterImageFormat(url), false, `${url} zou geweigerd moeten worden`);
    }
});

test('een raster-extensie moet aan het eind staan, niet ergens in het pad', () => {
    // `/foto.png/preview.svg` eindigt op een SVG; de `.png` halverwege mag niet
    // per ongeluk goedkeuren.
    assert.equal(isRasterImageFormat('/foto.png/preview.svg'), false);
    assert.equal(isRasterImageFormat('/map.jpg.d/icon.svg'), false);
});

test('SiteLayout gebruikt de guard en valt anders terug op de merkkaart', () => {
    // Bindt aan de live code: haalt iemand de guard weg, dan breekt dit.
    assert.match(
        LAYOUT,
        /import \{ isRasterImageFormat \} from '\.\.\/lib\/og-image-format';/,
        'SiteLayout importeert de raster-guard niet meer',
    );
    assert.match(
        LAYOUT,
        /const validPageOgImageUrl = isRasterImageFormat\(pageOgImageUrl\) \? pageOgImageUrl : undefined;/,
        'SiteLayout filtert het eigen og-beeld niet meer op raster-formaat',
    );
    assert.match(
        LAYOUT,
        /const ogImageUrl = validPageOgImageUrl \?\? toAbsoluteUrl\(DEFAULT_OG_IMAGE\);/,
        'een geweigerd og-beeld valt niet terug op DEFAULT_OG_IMAGE',
    );
    // LAT-4755: de alt hoort bij de kaart die we werkelijk serveren. Valt het
    // eigen beeld af, dan is dat de merkkaart en niet de paginatitel.
    assert.match(
        LAYOUT,
        /const ogImageAlt = validPageOgImageUrl \? pageTitle : DEFAULT_OG_IMAGE_ALT;/,
        'og:image:alt volgt de guard niet — een merkkaart zou de paginatitel als alt krijgen',
    );
});
