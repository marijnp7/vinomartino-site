import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const built = buildSync({ entryPoints: ['src/lib/accommodation-portraits.ts'], bundle: true, platform: 'node', packages: 'external', format: 'esm', write: false });
const { validatePortrait } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const gallery = [1, 2, 3].map((i) => ({ file_id: `00000000-0000-4000-8000-00000000000${i}`, credit: 'Foto: huis', source_url: 'https://example.com/photo' }));
const copy = { gallery_alts: Object.fromEntries(gallery.map((x) => [x.file_id, 'Room'])) };
for (const key of ['title','intro','booking_reason','why','considerations','rooms','wine','practical','booking_cta','hero_alt','hero_credit','disclosure','meta_title','meta_description']) copy[key] = 'Editorial copy';
const row = { id: 84, status: 'published', portrait_status: 'published', slug: 'house', name: 'House', hero_image: '247c49f5-3c29-49d5-9136-a60ce6762c65', website: 'https://example.com', streek_id: { slug: 'constantia' }, portrait_permission_ref: 'LAT-14377', portrait_review_ref: 'LAT-13897', booking_url: 'https://www.booking.com/hotel/za/house.html', portrait_gallery: gallery, portrait_content: copy };
test('complete NL and EN property portrait passes with tracked property link', () => {
  const result = validatePortrait(row, copy);
  assert.ok(result);
  assert.match(result.bookingHref.nl, /stay22\.com\/allez\/booking/);
  assert.match(result.bookingHref.nl, /accommodation-house/);
  assert.match(result.bookingHref.en, /en-gb/);
});
test('card status alone, missing rights, missing EN and search links never publish', () => {
  assert.equal(validatePortrait({ ...row, portrait_status: 'draft' }, copy), null);
  assert.equal(validatePortrait({ ...row, portrait_permission_ref: '' }, copy), null);
  assert.equal(validatePortrait(row, null), null);
  assert.equal(validatePortrait({ ...row, booking_url: 'https://www.booking.com/searchresults.html?ss=house' }, copy), null);
  assert.equal(validatePortrait({ ...row, portrait_gallery: gallery.slice(0, 2) }, copy), null);
});
