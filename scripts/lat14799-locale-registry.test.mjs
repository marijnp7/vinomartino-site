// LAT-14799 — generiek taalregister (fase 1 meertaligheid DE/FR/ES/IT).
// Bewaakt twee dingen: (1) NL/EN gedragen zich byte-identiek aan vóór het register,
// (2) een taal in het register maar niet in ENABLED_LOCALES heeft geen effect.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_REGISTRY, ENABLED_LOCALES, LOCALES, HREFLANG, HTML_LANG, OG_LOCALE, DATE_LOCALE,
  isLocale, localeFromPath, stripLocale, localizePath, localizeHref,
} from '../src/lib/i18n.ts';

test('alleen nl en en staan aan', () => {
  assert.deepEqual([...ENABLED_LOCALES], ['nl', 'en']);
  assert.deepEqual([...LOCALES], ['nl', 'en']);
  assert.deepEqual(Object.keys(LOCALE_REGISTRY).sort(), ['de', 'en', 'es', 'fr', 'it', 'nl']);
});

test('metadata NL/EN ongewijzigd', () => {
  assert.deepEqual(HREFLANG, { nl: 'nl', en: 'en' });
  assert.deepEqual(HTML_LANG, { nl: 'nl', en: 'en' });
  assert.deepEqual(OG_LOCALE, { nl: 'nl_NL', en: 'en_US' });
  assert.deepEqual(DATE_LOCALE, { nl: 'nl-NL', en: 'en-GB' });
});

test('padhelpers NL/EN ongewijzigd', () => {
  assert.equal(localeFromPath('/en'), 'en');
  assert.equal(localeFromPath('/en/streken/x/'), 'en');
  assert.equal(localeFromPath('/streken/x/'), 'nl');
  assert.equal(localeFromPath('/english/'), 'nl');
  assert.equal(stripLocale('/en'), '/');
  assert.equal(stripLocale('/en/streken/x/'), '/streken/x/');
  assert.equal(stripLocale('/streken/x/'), '/streken/x/');
  assert.equal(localizePath('/', 'en'), '/en/');
  assert.equal(localizePath('/streken/x/', 'en'), '/en/streken/x/');
  assert.equal(localizePath('/en/streken/x/', 'nl'), '/streken/x/');
  assert.equal(localizeHref('/streken/x/', 'en'), '/en/streken/x/');
});

test('uitgeschakelde talen hebben geen effect', () => {
  for (const l of ['de', 'fr', 'es', 'it']) {
    assert.equal(isLocale(l), false);
    assert.equal(localeFromPath(`/${l}/streken/x/`), 'nl');
    assert.equal(stripLocale(`/${l}/streken/x/`), `/${l}/streken/x/`);
  }
});
