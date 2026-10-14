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
t('beeldrecht = positieve lijst bekende licenties', () => {
  for (const l of ['pers', 'eigen', 'cc0', 'publiek-domein', 'toestemming-wijnhuis', ' PERS ']) assert.equal(m.hasConfirmedLicense(l), true, l);
  // CC BY eist maker-credit die dit blok niet toont; onbekende nieuwe waarden zijn geen recht.
  for (const l of [null, undefined, '', 'onbekend', 'booking-onbevestigd', 'pers-onbevestigd', 'synthetisch', 'cc-by-sa-4.0', 'cc-by-2.0', 'nieuw-label', 'pers?']) assert.equal(m.hasConfirmedLicense(l), false, String(l));
});

// Geïsoleerde fixture voor het inline client-script: nep-DOM + nep-klok, geen productieklok.
const fs = await import('node:fs'); const vm = await import('node:vm');
const astro = fs.readFileSync(new URL('../src/components/WijnhuisSpotlight.astro', import.meta.url), 'utf8');
const inline = astro.slice(astro.indexOf('<script is:inline>') + 18, astro.indexOf('</script>'));
function fixture(clock) {
  const mk = (s, e) => ({ dataset: { start: String(s), end: String(e) }, hidden: false });
  const items = [mk(clock.t + 2 * H, clock.t + 10 * H), mk(clock.t - H, clock.t + H)]; // HTML-volgorde = prioriteit
  const sec = { hidden: false, querySelectorAll: () => items };
  const listeners = {}; const timers = [];
  const doc = { hidden: false, querySelectorAll: () => [sec], addEventListener: (k, f) => { listeners['doc:' + k] = f; } };
  const ctx = { document: doc, Date: { now: () => clock.t }, Math, Infinity,
    setTimeout: (f, ms) => { timers.push({ f, at: clock.t + ms }); return timers.length; }, clearTimeout: () => {},
    window: { addEventListener: (k, f) => { listeners['win:' + k] = f; } } };
  vm.runInNewContext(inline, ctx);
  const tick = (ms) => { clock.t += ms; for (const tm of timers.splice(0)) { if (tm.at <= clock.t) tm.f(); else timers.push(tm); } };
  return { sec, items, listeners, tick, timers };
}
t('open tabblad: einde en volgende start zonder herladen', () => {
  const clock = { t: NOW }; const f = fixture(clock);
  assert.equal(f.sec.hidden, false); assert.equal(f.items[1].hidden, false, 'actief bij laden');
  f.tick(H + 1000); // einde item 2 verstreken, item 1 nog niet gestart
  assert.equal(f.sec.hidden, true, 'verlopen spotlight verdwijnt in open tab'); assert.equal(f.items[1].hidden, true);
  f.tick(H); // start item 1
  assert.equal(f.sec.hidden, false); assert.equal(f.items[0].hidden, false, 'geplande start verschijnt in open tab');
  f.tick(9 * H); assert.equal(f.sec.hidden, true, 'na laatste einde: blok weg, geen gat');
});
t('bfcache/pageshow en zichtbaar worden herberekenen', () => {
  const clock = { t: NOW }; const f = fixture(clock);
  f.timers.length = 0; clock.t += 1.5 * H; // timer gemist (tab bevroren)
  f.listeners['win:pageshow'](); assert.equal(f.sec.hidden, true, 'pageshow');
  clock.t += H; f.listeners['doc:visibilitychange'](); assert.equal(f.items[0].hidden, false, 'visibilitychange');
});
console.log(`${n}/7 pass`);
