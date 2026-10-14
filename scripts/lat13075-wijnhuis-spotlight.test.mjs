// LAT-13075 — spotlight-regels: geldigheid, overlap en timing zonder rebuild.
import assert from 'node:assert/strict';
const m = await import('../src/lib/wijnhuis-spotlight-rules.ts');
const H = 3600e3, NOW = Date.parse('2026-10-14T12:00:00Z');
const huis = (slug, extra = {}) => ({ slug, name: slug, heroImage: `/img/${slug}.avif`, heroImageId: slug, portret: {}, ...extra });
const huizen = [huis('voerzio'), huis('lieser'), huis('zonderbeeld', { heroImage: null })];
const row = (id, slug, s, e, extra = {}) => ({ id, status: 'published', wijnhuisSlug: slug, startAt: new Date(NOW + s * H).toISOString(), endAt: new Date(NOW + e * H).toISOString(), campagneId: '', teaserNl: 'Nu interessant. Kort.', teaserEn: 'Interesting now. Short.', ...extra });
const ok = () => true;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('actief, toekomstig, verlopen', () => {
  const { entries } = m.validateSpotlights([row(1, 'voerzio', -1, 119), row(2, 'lieser', 120, 240), row(3, 'lieser', -200, -1)], huizen, 'nl', ok);
  assert.equal(m.pickActive(entries, NOW)?.id, 1);
  assert.equal(m.pickActive(entries, NOW + 121 * H)?.id, 2, 'start zonder rebuild');
  assert.equal(m.pickActive(entries, NOW + 241 * H), null, 'einde zonder rebuild: blok weg');
  assert.deepEqual(m.renderCandidates(entries, NOW).map((e) => e.id), [1], 'verlopen niet in HTML, >horizon nog niet');
  assert.deepEqual(m.renderCandidates(entries, NOW + 100 * H).map((e) => e.id), [2, 1], 'volgende staat al in HTML vóór start');
});
t('afwijzingen', () => {
  const { entries, rejected } = m.validateSpotlights([
    row(1, 'voerzio', -1, 5, { status: 'draft' }), row(2, 'onbekend', -1, 5), row(3, 'voerzio', -1, 5, { teaserEn: '' }),
    row(4, 'zonderbeeld', -1, 5), row(5, 'voerzio', 5, -1), row(6, 'voerzio', -1, 5, { teaserNl: 'Een. Twee. Drie.' }),
  ], huizen, 'en', ok);
  assert.equal(entries.length, 0);
  assert.deepEqual(rejected.map((r) => r.id), [1, 2, 3, 4, 5, 6]);
  assert.equal(m.validateSpotlights([row(7, 'voerzio', -1, 5)], huizen, 'nl', () => false).entries.length, 0, 'zonder DAM-licentie geen spotlight');
});
t('overlap: één deterministische winnaar', () => {
  const { entries } = m.validateSpotlights([row(9, 'lieser', -10, 50), row(4, 'voerzio', -2, 50), row(3, 'lieser', -2, 50)], huizen, 'nl', ok);
  assert.equal(m.pickActive(entries, NOW)?.id, 3, 'laatst gestart, dan laagste id');
  assert.deepEqual(entries.map((e) => e.id), [3, 4, 9], 'HTML-volgorde = clientregel');
});
t('locale-teaser', () => {
  assert.equal(m.validateSpotlights([row(1, 'voerzio', -1, 5)], huizen, 'en', ok).entries[0].teaser, 'Interesting now. Short.');
});
console.log(`${n}/4 pass`);
