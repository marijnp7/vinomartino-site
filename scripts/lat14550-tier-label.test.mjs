// LAT-14550 — StayTierLabel (icoon + naam) vervangt de tekstbadge van accommodaties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const LABEL = src('../src/components/StayTierLabel.astro');
const POI = src('../src/components/PoiCard.astro');
const KAART = src('../src/components/AccommodatieKaart.astro');
const PAGE = src('../src/components/AccommodatieRoundupPage.astro');
const CLIENT = src('../src/lib/keuzehulp-client.ts');
const UI = src('../src/lib/ui-strings.ts');

test('label = icoon + zichtbare tiernaam, drie varianten', () => {
  assert.match(LABEL, /<StayTierIcon tier=\{tier\} size=\{size\} \/>\{ui\.t\(`stay\.tier\.\$\{tier\}`\)\}/);
  for (const v of ['badge', 'inline', 'head']) assert.match(LABEL, new RegExp(`stay-tier-label--${v}`));
  assert.match(LABEL, /border: 1px solid currentColor/);
});

test('PoiCard en AccommodatieKaart tonen de tier als StayTierLabel, niet als tekst in de meta', () => {
  assert.match(POI, /<StayTierLabel tier=\{tier\} variant="badge"/);
  assert.match(KAART, /const compactMeta = plaatsKort\(kaart\.plaats\);/);
  assert.match(KAART, /tier: tierBadge,/);
});

test('klassefilter is een segmented control met aria-pressed op een verborgen select', () => {
  assert.match(PAGE, /data-kh-seg="klasse" data-value="" aria-pressed="true"/);
  assert.match(PAGE, /<StayTierLabel tier=\{tier as StayTier\} variant="inline"/);
  assert.match(PAGE, /<select id="acc-klasse" name="klasse" data-kh-select hidden/);
  assert.match(CLIENT, /b\.setAttribute\('aria-pressed', String\(sel\.value === v\)\)/);
});

test('EN heeft eigen tiernamen zonder em-dash', () => {
  for (const [k, v] of [['slim_geboekt', 'Smart booking'], ['prijs_kwaliteit', 'Great value'], ['pure_luxe', 'Pure luxury']]) {
    assert.ok(UI.includes(`'stay.tier.${k}': '${v}'`), k);
  }
});
