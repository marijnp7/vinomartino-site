// LAT-12594/LAT-13390: keep the global preload limited to normal. The italic
// face is only needed by the wijnhuizen index hero and is gated per page.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const layout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');
const preloads = [...layout.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1]);

test('italic preload is limited to the wijnhuizen index', () => {
  assert.deepEqual(preloads, [
    '/fonts/cormorant-garamond-latin-abcaa8b4.woff2',
    '/fonts/cormorant-garamond-latin-4db21dbf.woff2',
  ]);
  assert.match(layout, /preloadCormorantItalic && <link rel="preload" href="\/fonts\/cormorant-garamond-latin-4db21dbf\.woff2"/);
  assert.match(readFileSync('src/components/WijnhuizenIndex.astro', 'utf8'), /<SiteLayout[\s\S]*?preloadCormorantItalic\s*>/);
  assert.doesNotMatch(readFileSync('src/components/WijnroutesHub.astro', 'utf8'), /preloadCormorantItalic/);
});

test('preloaded fonts exist and match their CSS faces', () => {
  const css = readFileSync('src/styles/fonts.css', 'utf8');
  for (const [i, href] of preloads.entries()) {
    assert.ok(existsSync(`public${href}`), `${href} ontbreekt in public/`);
    const style = i === 0 ? 'normal' : 'italic';
    const face = css.split('@font-face').find((b) => b.includes(href) && new RegExp(`font-style:\\s*${style}`).test(b));
    assert.ok(face, `${href} is geen ${style}-face in fonts.css`);
  }
});
