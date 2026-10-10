// LAT-13099: regressietest "Op de proeftafel".
// Bewaakt:
//   1. elke ui.t()-key in de proeftafel-componenten heeft een NL-default én een EN-waarde;
//   2. geen em-dash in de nieuwe strings; alleen de voornaam Marijn, nooit "Martin";
//   3. geen verzendadres op de site (postcode/straat-patroon) in strings of templates;
//   4. NL- en EN-pagina's bestaan; de streekpagina rendert het blok;
//   5. nginx-route /api/inzendingen/wijn is POST-only en proxyt naar wijn_inzendingen;
//   6. het schema-script zet public create zonder `status` in de veld-whitelist;
//   7. schrijfrichtlijn v2: herkomstregel boven het verdictblok, UTM-winkellink,
//      baan in schema + formulier, zo-werkt-het-pagina's, nominatievraag-slot, reviewTitle.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { UI_STRING_DEFAULTS, UI_STRING_EN } = await import('../src/lib/ui-strings.ts');
const { shopUrlWithUtm, reviewTitle, formatEuro, fill, hasAffiliateLinks, BANEN, HERKOMST } = await import('../src/lib/wijn-reviews.ts');

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const COMPONENT_DIR = 'src/components/proeftafel/';
const components = readdirSync(new URL(COMPONENT_DIR, root)).filter((f) => f.endsWith('.astro'));
const sources = components.map((f) => read(COMPONENT_DIR + f)).join('\n');
const PREFIX = 'proeftafel.';
const newKeys = Object.keys(UI_STRING_DEFAULTS).filter((k) => k.startsWith(PREFIX));

test('components gebruiken alleen bestaande keys (NL + EN)', () => {
  const used = new Set();
  for (const m of sources.matchAll(/ui\.t\(\s*['"`]([^'"`$]+)['"`]\s*\)/g)) used.add(m[1]);
  for (const m of sources.matchAll(/\bT\(\s*['"`]([^'"`$]+)['"`]\s*\)/g)) used.add(`proeftafel.insturen.${m[1]}`);
  assert.ok(used.size > 20, `te weinig keys gevonden (${used.size}); regex kapot?`);
  for (const k of used) {
    assert.ok(UI_STRING_DEFAULTS[k], `NL-default ontbreekt: ${k}`);
    assert.ok(UI_STRING_EN[k], `EN-waarde ontbreekt: ${k}`);
  }
});

test('elke proeftafel-key heeft NL en EN', () => {
  assert.ok(newKeys.length > 50);
  for (const k of newKeys) assert.ok(UI_STRING_EN[k], `EN ontbreekt: ${k}`);
  // dynamische keys (verdict/kleur/prijsband/insturen-opties) gedekt
  for (const v of ['kopen', 'proberen', 'laten-staan', 'niet-beoordeeld']) assert.ok(UI_STRING_DEFAULTS[`proeftafel.verdict.${v}`]);
  for (const v of ['rood', 'wit', 'rose', 'mousserend', 'zoet', 'oranje']) assert.ok(UI_STRING_EN[`proeftafel.kleur.${v}`]);
  for (const v of ['tot-12', '12-25', 'boven-25']) assert.ok(UI_STRING_EN[`proeftafel.prijsband.${v}`]);
  for (const v of ['onafhankelijk', 'elk_oordeel', 'geen_garantie', 'privacy']) assert.ok(UI_STRING_EN[`proeftafel.insturen.akkoord.${v}`]);
});

const values = newKeys.flatMap((k) => [UI_STRING_DEFAULTS[k], UI_STRING_EN[k]]);

test('merkpoort: geen em-dash, geen Martin, alleen voornaam', () => {
  for (const v of values) {
    assert.ok(!/[—–]/.test(v), `gedachtestreepje in: ${v}`);
    assert.ok(!/\bMartin\b/.test(v), `"Martin" in: ${v}`);
    assert.ok(!/Marijn\s+[A-Z][a-z]+/.test(v.replace(/Marijn (will|je|mailt)\b/g, '')), `mogelijke achternaam na Marijn: ${v}`);
  }
  assert.equal(UI_STRING_DEFAULTS['proeftafel.author.name'], 'Marijn');
  assert.ok(!/[—]/.test(sources), 'em-dash in een proeftafel-template');
});

test('geen verzendadres op de site', () => {
  const ADDRESS = [/\b\d{4}\s?[A-Z]{2}\b/, /(straat|laan|weg|plein|gracht)\s+\d+/i, /\b(postbus|p\.o\. box)\b/i];
  for (const text of [...values, sources]) {
    for (const re of ADDRESS) assert.ok(!re.test(text), `adres-patroon ${re} gevonden`);
  }
  // De intro moet expliciet zeggen dat het een aanmelding is en Marijn het adres mailt.
  assert.match(UI_STRING_DEFAULTS['proeftafel.insturen.intro'], /aanmelding/);
  assert.match(UI_STRING_DEFAULTS['proeftafel.insturen.intro'], /mailt Marijn je het verzendadres/);
});

test('pagina\'s bestaan (NL + EN) en streekpagina rendert het blok', () => {
  for (const p of ['index.astro', '[slug].astro', 'insturen.astro', 'zo-werkt-het.astro']) {
    assert.ok(existsSync(new URL(`src/pages/op-de-proeftafel/${p}`, root)), `NL ${p}`);
    assert.ok(existsSync(new URL(`src/pages/en/op-de-proeftafel/${p}`, root)), `EN ${p}`);
  }
  assert.match(read('src/components/StreekDetail.astro'), /<GeproefdUitStreek streekSlug=\{entry\.slug\}/);
  const detail = read('src/components/proeftafel/ProeftafelDetail.astro');
  assert.match(detail, /'@type': 'Review'/);
  assert.ok(!/ratingValue|reviewRating/.test(detail), 'geen numerieke rating in JSON-LD');
});

test('insturen-formulier: honeypot, min-invultijd, maxlength 300, max 2 flessen, 4 akkoorden', () => {
  const f = read('src/components/proeftafel/ProeftafelInsturen.astro');
  assert.match(f, /name="website"/);
  assert.match(f, /MIN_FILL_MS/);
  assert.match(f, /name="toelichting" maxlength="300"/);
  assert.match(f, /name="aantal_flessen" type="number" min="1" max="2"/);
  assert.match(f, /AKKOORD = \['onafhankelijk', 'elk_oordeel', 'geen_garantie'\]/);
  assert.match(f, /name="akkoord_privacy" required/);
  assert.match(f, /fetch\('\/api\/inzendingen\/wijn'/);
});

test('nginx: /api/inzendingen/wijn is POST-only naar wijn_inzendingen', () => {
  const conf = read('nginx-prod.conf');
  const m = conf.match(/location = \/api\/inzendingen\/wijn \{([\s\S]*?)\n    \}/);
  assert.ok(m, 'route ontbreekt');
  assert.match(m[1], /if \(\$request_method != POST\) \{ return 405; \}/);
  assert.match(m[1], /limit_req zone=inzendingen/);
  assert.match(m[1], /vinomartino-directus-1:8055\/items\/wijn_inzendingen;/);
  assert.match(conf, /limit_req_zone \$binary_remote_addr zone=inzendingen:/);
});

test('schema-script: public create zonder status, read alleen published', () => {
  const s = read('directus/scripts/create-proeftafel-schema.mjs');
  assert.match(s, /filter\(\(f\) => f !== 'status' && f !== 'date_created'\)/);
  assert.match(s, /ensurePermission\(pub, 'wijn_reviews', 'read', \{ permissions: published \}/);
  assert.ok(!/ensurePermission\(pub, 'wijn_inzendingen', '(read|update|delete)'/.test(s), 'public mag inzendingen niet lezen/wijzigen');
  assert.match(s, /--dry-run/);
  assert.match(s, /type: 'mail'/);
});

// ---- schrijfrichtlijn v2 ------------------------------------------------------------

const detail = read('src/components/proeftafel/ProeftafelDetail.astro');
const pos = (needle) => {
  const i = detail.indexOf(needle);
  assert.ok(i >= 0, `ontbreekt in ProeftafelDetail: ${needle}`);
  return i;
};

test('v2: herkomstregel staat boven het verdictblok, nominatievraag tussen Proef de streek en Voor de liefhebber', () => {
  const herkomst = pos('data-pt-herkomst');
  const verdict = pos('<section class="pt-verdictblok">');
  const streek = pos('<section class="pt-streek">');
  const nominatie = pos('data-pt-nominatie');
  const liefhebber = pos('<details class="pt-liefhebber">');
  assert.ok(herkomst < verdict, 'herkomstregel moet boven het verdictblok staan');
  assert.ok(streek < nominatie && nominatie < liefhebber, 'nominatievraag hoort na Proef de streek en voor Voor de liefhebber');
  // het oude herkomstslot onderaan (v1, positie 8) is weg
  assert.equal(detail.match(/class="pt-herkomst"/g)?.length, 1, 'precies één herkomstregel');
  assert.ok(!/herkomst\.(toegestuurd|gekocht)/.test(detail), 'v1-herkomstkeys nog in gebruik');
  // vaste teksten uit ui-strings, niet hardcoded
  assert.ok(!/Niemand betaalde|affiliate links\. Boek/.test(detail), 'vaste tekst hardcoded in template');
  assert.match(detail, /ui\.t\(`proeftafel\.detail\.herkomst\.\$\{r\.herkomst\}`\)/);
  assert.match(detail, /ui\.t\('proeftafel\.detail\.affiliate'\)/);
  assert.match(detail, /r\.nominatievraag \|\| ui\.t\('proeftafel\.detail\.nominatievraag'\)/);
});

test('v2: vaste herkomst-, affiliate- en nominatieteksten (NL + EN)', () => {
  assert.deepEqual([...HERKOMST], ['zelf_gekocht', 'gekregen']);
  assert.equal(fill(UI_STRING_DEFAULTS['proeftafel.detail.herkomst.zelf_gekocht'], { winkel: 'Lof' }), 'Zelf gekocht bij Lof, op hun advies. Niemand betaalde voor dit oordeel.');
  assert.equal(fill(UI_STRING_DEFAULTS['proeftafel.detail.herkomst.gekregen'], { winkel: 'Wijnkoperij Europa' }), 'Gekregen van Wijnkoperij Europa. Ze wisten vooraf dat elk oordeel mogelijk was.');
  assert.equal(UI_STRING_DEFAULTS['proeftafel.detail.affiliate'], 'Dit stuk bevat affiliate links. Boek je via ons, dan krijgen wij een kleine vergoeding. Dat verandert het oordeel niet.');
  assert.equal(UI_STRING_DEFAULTS['proeftafel.detail.nominatievraag'], 'In welke winkel moet ik volgende keer de beste fles onder €20 vragen?');
  for (const h of HERKOMST) assert.match(UI_STRING_EN[`proeftafel.detail.herkomst.${h}`], /\{winkel\}/);
  assert.ok(UI_STRING_EN['proeftafel.detail.affiliate'] && UI_STRING_EN['proeftafel.detail.nominatievraag']);
});

test('v2: hasAffiliateLinks via redactieveld of affiliate-href', () => {
  assert.equal(hasAffiliateLinks({ affiliateLinks: false, winkelUrl: 'https://lofwijn.nl/' }), false);
  assert.equal(hasAffiliateLinks({ affiliateLinks: true, winkelUrl: '' }), true);
  assert.equal(hasAffiliateLinks({ affiliateLinks: false, winkelUrl: '', proefDeStreekHtml: '<a href="https://www.booking.com/hotel/fr/x.html?aid=1&amp;b=2">slapen</a>' }), true);
});

test('v2: winkellink krijgt UTM per aflevering', () => {
  const utm = 'utm_source=vinomartino&utm_medium=referral&utm_campaign=op-de-proeftafel&utm_content=le-devay-syrah-2024';
  assert.equal(shopUrlWithUtm('https://lofwijn.nl/wijn/le-devay', 'le-devay-syrah-2024'), `https://lofwijn.nl/wijn/le-devay?${utm}`);
  // bestaande query-params blijven staan
  assert.equal(shopUrlWithUtm('https://lofwijn.nl/p?id=12&kleur=rood', 'le-devay-syrah-2024'), `https://lofwijn.nl/p?id=12&kleur=rood&${utm}`);
  // fragment blijft achteraan
  assert.equal(shopUrlWithUtm('https://lofwijn.nl/p#koop', 'x'), 'https://lofwijn.nl/p?utm_source=vinomartino&utm_medium=referral&utm_campaign=op-de-proeftafel&utm_content=x#koop');
  // geen dubbele utm
  assert.equal(shopUrlWithUtm('https://lofwijn.nl/p?utm_source=insta', 'x'), 'https://lofwijn.nl/p?utm_source=insta');
  assert.equal(shopUrlWithUtm('https://lofwijn.nl/p?UTM_Campaign=a', 'x'), 'https://lofwijn.nl/p?UTM_Campaign=a');
  // geen URL = ongewijzigd
  assert.equal(shopUrlWithUtm('', 'x'), '');
  assert.equal(shopUrlWithUtm('lofwijn.nl', 'x'), 'lofwijn.nl');
  // de template gebruikt de helper voor de te-koop-bij-link en de Offer-url
  assert.match(detail, /shopUrlWithUtm\(r\.winkelUrl, r\.slug\)/);
  assert.match(detail, /<a href=\{shopHref\}/);
  assert.ok(!/href=\{r\.winkelUrl\}/.test(detail), 'kale winkel_url zonder UTM in de template');
});

const base = { seoTitle: '', titel: 'Le Devay Syrah', wijn: 'Le Devay Syrah Au Fil du Rhône 2024', wijnKort: 'Syrah', winkelNaam: 'Lof', winkelStad: 'Amsterdam', prijsEur: 26.75, categorie: 'beste-prijs-kwaliteit' };
const tplNl = UI_STRING_DEFAULTS['proeftafel.titel.formule'];

test('v2: reviewTitle volgt de formule, seo_title wint', () => {
  assert.equal(formatEuro(26.75), '€26,75');
  assert.equal(reviewTitle(base, { template: tplNl, categorieLabel: 'Beste prijs-kwaliteit' }),
    'Beste prijs-kwaliteit bij Lof in Amsterdam: Syrah voor €26,75, kopen of laten staan?');
  assert.equal(reviewTitle({ ...base, seoTitle: 'Eigen titel' }, { template: tplNl, categorieLabel: 'Beste prijs-kwaliteit' }), 'Eigen titel');
  // zonder stad vervalt " in {stad}"
  assert.equal(reviewTitle({ ...base, winkelStad: '' }, { template: tplNl, categorieLabel: 'Beste prijs-kwaliteit' }),
    'Beste prijs-kwaliteit bij Lof: Syrah voor €26,75, kopen of laten staan?');
  // zonder winkel of prijs: geen halve formule, terug naar de redactionele titel
  assert.equal(reviewTitle({ ...base, winkelNaam: '' }, { template: tplNl }), 'Le Devay Syrah');
  assert.equal(reviewTitle({ ...base, prijsEur: null }, { template: tplNl }), 'Le Devay Syrah');
  // EN-formule
  assert.equal(reviewTitle(base, { template: UI_STRING_EN['proeftafel.titel.formule'], categorieLabel: 'Best value', locale: 'en' }),
    'Best value at Lof in Amsterdam: Syrah for €26.75, buy or leave it?');
  // template gebruikt de helper voor <title> (SiteLayout zet og:title uit dezelfde title)
  assert.match(detail, /title=\{pageTitle\}/);
  assert.match(detail, /reviewTitle\(r,/);
});

test('v2: baan in schema en formulier, kwartaalregel zichtbaar', () => {
  const s = read('directus/scripts/create-proeftafel-schema.mjs');
  assert.match(s, /const BANEN = \[\['onder_20', 'Beste fles onder €20'\], \['feestfles', 'Beste feestfles'\]\];/);
  assert.match(s, /select\('baan', BANEN, [^\n]*required: true/);
  assert.match(s, /\{ baan: \{ _in: BANEN\.map/);
  assert.match(s, /select\('herkomst', \[\['zelf_gekocht', 'Zelf gekocht'\], \['gekregen', 'Gekregen'\]\][^\n]*required: true/);
  for (const f of ['winkel_stad', 'wijn_kort', 'seo_title', 'nominatievraag', 'affiliate_links']) assert.match(s, new RegExp(`'${f}'`), `schemaveld ${f}`);
  assert.deepEqual([...BANEN], ['onder_20', 'feestfles']);
  const f = read('src/components/proeftafel/ProeftafelInsturen.astro');
  assert.match(f, /<select name="baan" required>/);
  assert.match(f, /baan: txt\('baan'\)/);
  assert.match(f, /T\('regel\.kwartaal'\)/);
  assert.equal(UI_STRING_DEFAULTS['proeftafel.insturen.baan.onder_20'], 'Beste fles onder €20');
  assert.equal(UI_STRING_DEFAULTS['proeftafel.insturen.baan.feestfles'], 'Beste feestfles');
  assert.equal(UI_STRING_DEFAULTS['proeftafel.insturen.regel.kwartaal'], 'Maximaal één aflevering per winkel per kwartaal.');
  for (const b of BANEN) assert.ok(UI_STRING_EN[`proeftafel.insturen.baan.${b}`]);
});

test('v2: zo-werkt-het (NL + EN) bestaat, gelinkt, geen adres en geen achternaam', () => {
  const comp = read('src/components/proeftafel/ProeftafelZoWerktHet.astro');
  assert.match(read('src/pages/op-de-proeftafel/zo-werkt-het.astro'), /<ProeftafelZoWerktHet /);
  assert.match(read('src/pages/en/op-de-proeftafel/zo-werkt-het.astro'), /<ProeftafelZoWerktHet locale="en"/);
  for (const c of ['ProeftafelIndex.astro', 'ProeftafelInsturen.astro']) {
    assert.match(read(COMPONENT_DIR + c), /localizePath\('\/op-de-proeftafel\/zo-werkt-het\/', locale\)/, `link vanaf ${c}`);
  }
  const keys = Object.keys(UI_STRING_DEFAULTS).filter((k) => k.startsWith('proeftafel.zowerkthet.'));
  for (const k of ['winkels.baan', 'winkels.oordeel', 'winkels.kwartaal', 'winkels.nix18', 'winkels.klikoverzicht', 'winkels.schapkaart', 'huisregels.tiktok', 'huisregels.weggeven', 'huisregels.leeftijd', 'huisregels.nix18']) {
    assert.ok(keys.includes(`proeftafel.zowerkthet.${k}`), `key ${k}`);
    assert.ok(comp.includes(`'${k.split('.')[1]}'`), `component rendert ${k}`);
  }
  const ADDRESS = [/\b\d{4}\s?[A-Z]{2}\b/, /(straat|laan|weg|plein|gracht|dijk)\s+\d+/i, /\b(postbus|p\.o\. box)\b/i, /Haarlemmerdijk|Spaarndammerstraat/];
  const texts = [comp, ...keys.flatMap((k) => [UI_STRING_DEFAULTS[k], UI_STRING_EN[k]])];
  for (const t of texts) {
    for (const re of ADDRESS) assert.ok(!re.test(t), `adres-patroon ${re} in zo-werkt-het`);
    assert.ok(!/[—–]/.test(t), `gedachtestreepje: ${t}`);
    assert.ok(!/\bMartin\b/.test(t), `Martin: ${t}`);
    assert.ok(!/Marijn\s+[A-Z][a-z]+/.test(t), `mogelijke achternaam: ${t}`);
  }
  assert.match(UI_STRING_DEFAULTS['proeftafel.zowerkthet.huisregels.leeftijd'], /25 jaar/);
  assert.match(UI_STRING_DEFAULTS['proeftafel.zowerkthet.huisregels.tiktok'], /TikTok/);
});
