// LAT-12028 — redtest voor scripts/lint-authenticiteit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function makeHtml(body, badge = '') {
  // Zoals op productie staat de body binnen de tier-root (<article data-page-tier>); de lint
  // scant regel a/b/f alleen daarbinnen (LAT-12964).
  const inhoud = badge.endsWith('</article>') ? badge.replace(/<\/article>$/, `${body}</article>`) : badge + body;
  return `<!doctype html><html><head><title>Test</title></head><body>${inhoud}</body></html>`;
}

function runLint(dir, lenient = false) {
  const args = [
    '--input-type=module',
    '--eval',
    `process.env.DIST_DIR=${JSON.stringify(dir)};` +
    `const {default:d}=await import(${JSON.stringify(process.cwd()+'/scripts/lint-authenticiteit.mjs')})`,
  ];
  // Gebruik child_process zodat het bestand van rechte kant draait
  const res = spawnSync(
    process.execPath,
    ['scripts/lint-authenticiteit.mjs', dir, ...(lenient ? ['--lenient'] : [])],
    { encoding: 'utf8', cwd: process.cwd() },
  );
  const out = res.stdout + res.stderr;
  const exit = res.status ?? 1;
  return { exit, out };
}

function withDir(pages, fn) {
  const dir = join(tmpdir(), `lat12028-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, html] of Object.entries(pages)) {
    writeFileSync(join(dir, name), html, 'utf8');
  }
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Regel c: Tier-label maakt de lint rood
test('regel c: Tier2-label geeft overtreding', () => {
  withDir({ 'index.html': makeHtml('<p>Inhoud. Tier2 Redactiegids artikel over wijn.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /Tier-label/);
    assert.equal(exit, 1);
  });
});

// Regel c: LAT-ticketnummer is een overtreding
test('regel c: LAT-ticketnummer geeft overtreding', () => {
  withDir({ 'index.html': makeHtml('<p>Meer info: zie LAT-9999 voor de context.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /Ticketnummer/);
    assert.equal(exit, 1);
  });
});

// Regel d: em-dash is een overtreding
test('regel d: em-dash geeft overtreding', () => {
  withDir({ 'index.html': makeHtml('<p>Dit is een zin — met een gedachtestreep.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /em-dash/);
    assert.equal(exit, 1);
  });
});

// Regel d: bereik met en-dash is geen overtreding
test('regel d: maandbereik mei–oktober is geen overtreding', () => {
  withDir({ 'index.html': makeHtml('<p>Beste periode: mei–oktober voor een bezoek.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.doesNotMatch(out, /en-dash als gedachtestreep/);
  });
});

// Regel e: "Martin" is een overtreding
test('regel e: Martin geeft overtreding', () => {
  withDir({ 'index.html': makeHtml('<p>Geschreven door Martin Petermeijer.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /"Martin"/);
    assert.equal(exit, 1);
  });
});

// Regel e: "WSET 4" is een overtreding
test('regel e: WSET 4 geeft overtreding', () => {
  withDir({ 'index.html': makeHtml('<p>Marijn heeft WSET 4 gehaald.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /WSET 4/);
    assert.equal(exit, 1);
  });
});

// Regel a: eerste persoon VT op Redactiegids-pagina is een overtreding
test('regel a: eerste persoon VT op Redactiegids', () => {
  withDir({ 'index.html': makeHtml('<article data-page-tier="redactiegids"><span class="badge">Redactiegids</span><p>We sliepen in een charmant hotel.</p></article>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /eerste persoon VT/);
    assert.equal(exit, 1);
  });
});

// Regel g: Sophie in FAQ is een overtreding
test('regel g: Sophie in FAQ-blok', () => {
  withDir({ 'index.html': makeHtml('<dl class="faq"><dt>Wie schrijft dit?</dt><dd>Sophie van onze redactie.</dd></dl>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /Sophie.*FAQ/);
    assert.equal(exit, 1);
  });
});

// Schone pagina: exit 0
test('schone pagina: geen overtredingen', () => {
  withDir({ 'index.html': makeHtml('<p>Marijn bezocht Champagne in het voorjaar. Zie <a href="/affiliate-verklaring/">de verklaring</a>.</p>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.equal(exit, 0);
  });
});

// --- LAT-12376: HARDE REGEL 57 herzien: [bron: marijn YYYY-MM-DD] naast [bron: RS-id] ---
// Regel b/f draaien alleen met een gevulde plaatsen.yml, dus draai in een tempdir met fixtures.
const LINT = join(process.cwd(), 'scripts/lint-authenticiteit.mjs');
const ZG = '<article data-page-tier="zelf-gereisd"><span class="badge">Zelf gereisd</span></article>';
const GIDS = '<article data-page-tier="redactiegids"><span class="badge">Redactiegids</span></article>';

function runZg(body, badge = ZG) {
  const root = join(tmpdir(), `lat12376-${Math.random().toString(36).slice(2)}`);
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(root, 'plaatsen.yml'), 'Loire:\n  - Chinon\n  - Saumur\n', 'utf8');
  writeFileSync(join(root, 'bezocht.yml'), 'streken:\n  - Loire\n', 'utf8');
  writeFileSync(join(dist, 'index.html'), makeHtml(body, badge), 'utf8');
  try {
    const res = spawnSync(process.execPath, [LINT, 'dist'], { encoding: 'utf8', cwd: root });
    return { exit: res.status ?? 1, out: res.stdout + res.stderr };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('regel f: claim met [bron: RS-id] is geldig (ongewijzigd)', () => {
  const { exit, out } = runZg('<p>We sliepen in Chinon. [bron: RS-1234]</p>');
  assert.equal(exit, 0, out);
});

test('regel f: claim met [bron: marijn YYYY-MM-DD] is geldig', () => {
  const { exit, out } = runZg('<p>We sliepen in Chinon. [bron: marijn 2026-10-03]</p>');
  assert.equal(exit, 0, out);
});

test('regel f: markering is niet hoofdlettergevoelig en staat ook binnen de zin', () => {
  const { exit, out } = runZg('<p>We aten in Saumur [Bron: Marijn 2026-09-30] en bleven slapen.</p>');
  assert.equal(exit, 0, out);
});

test('regel f: marijn-bron met place buiten plaatsen.yml is ook geldig (geen foto nodig)', () => {
  const { exit, out } = runZg('<p>Ik zag Azay-le-Rideau in de ochtendmist. [bron: marijn 2026-10-03]</p>');
  assert.equal(exit, 0, out);
});

test('regel f: data-bron="marijn YYYY-MM-DD" op het element is geldig', () => {
  const { exit, out } = runZg('<p data-bron="marijn 2026-10-03">We dronken in Chinon een Cabernet Franc.</p>');
  assert.equal(exit, 0, out);
});

test('regel f: claim zonder markering blijft een overtreding', () => {
  const { exit, out } = runZg('<p>We sliepen in Chinon.</p>');
  assert.match(out, /\[f\]/);
  assert.equal(exit, 1);
});

test('regel f: marijn zonder datum is ongeldig', () => {
  const { exit, out } = runZg('<p>We sliepen in Chinon. [bron: marijn]</p>');
  assert.match(out, /\[f\]/);
  assert.equal(exit, 1);
});

test('regel f: onmogelijke datum en NL-datumnotatie zijn ongeldig', () => {
  for (const bron of ['marijn 2026-13-45', 'marijn 2026-02-30', 'marijn 3-10-2026']) {
    const { exit, out } = runZg(`<p>We sliepen in Chinon. [bron: ${bron}]</p>`);
    assert.match(out, /\[f\]/, bron);
    assert.equal(exit, 1, bron);
  }
});

test('regel f: andere bronnen dan RS-id of marijn zijn ongeldig', () => {
  const { exit, out } = runZg('<p>We sliepen in Chinon. [bron: internet]</p>');
  assert.match(out, /\[f\]/);
  assert.equal(exit, 1);
});

test('regel f: marker ver weg (ander deel van de pagina) dekt de claim niet', () => {
  const vulling = '<p>' + 'Neutrale tekst over de streek. '.repeat(30) + '</p>';
  const { exit, out } = runZg(`<p>We sliepen in Chinon.</p>${vulling}<p>Ander stuk. [bron: marijn 2026-10-03]</p>`);
  assert.match(out, /\[f\]/);
  assert.equal(exit, 1);
});

test('regel f: marker bij sentence op lange pagina wordt gevonden (offset-bug)', () => {
  const kop = '<nav>' + '<a href="/x">menu</a>'.repeat(80) + '</nav>';
  const { exit, out } = runZg(`${kop}<p>We sliepen in Chinon. [bron: marijn 2026-10-03]</p>`);
  assert.equal(exit, 0, out);
});

test('ik-stem mening zonder bezoekclaim blokkeert niet (Zelf gereisd)', () => {
  const { exit, out } = runZg('<p>Hier zou ik slapen. Dit huis staat bovenaan mijn lijst. Ik zou dit overslaan.</p>');
  assert.equal(exit, 0, out);
});

test('ik-stem mening zonder bezoekclaim blokkeert niet (Redactiegids)', () => {
  const { exit, out } = runZg('<p>Hier zou ik slapen. Dit huis staat bovenaan mijn lijst. Ik zou dit overslaan.</p>', GIDS);
  assert.equal(exit, 0, out);
});

test('bezoekclaim op Redactiegids blijft een overtreding (regel a), ook met marijn-bron', () => {
  const { exit, out } = runZg('<p>We sliepen in Chinon. [bron: marijn 2026-10-03]</p>', GIDS);
  assert.match(out, /\[a\]/);
  assert.equal(exit, 1);
});

// LAT-12964 — redtest: "Zelf gereisd" in nav/legenda mag een Redactiegids-pagina niet tot Tier 1 maken.
const NAV_ZG = '<nav><a href="/streken/?filter=zelf">Zelf gereisd</a></nav><p>Legenda: Zelf gereisd / Redactiegids</p>';

test('regel a: Redactiegids met "Zelf gereisd" in nav + Sophie in body geeft overtreding', () => {
  withDir({ 'index.html': makeHtml(NAV_ZG + '<article data-page-tier="redactiegids"><p>Sophie wijst naar de kelder.</p></article>') }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /\[a\].*Sophie/);
    assert.match(out, /"redactiegids": 1/);
    assert.equal(exit, 1);
  });
});

test('tier: pagina zonder data-page-tier telt als zonderTier, niet als Zelf gereisd', () => {
  withDir({ 'index.html': makeHtml(NAV_ZG + '<p>Overzicht.</p>') }, (dir) => {
    const { out } = runLint(dir);
    assert.match(out, /"zelfGereisd": 0/);
    assert.match(out, /"zonderTier": 1/);
  });
});

// LAT-12964 stap 3: gedeelde blokken buiten de pagina-root (header-disclosure met ik-zin,
// Ontdek verder) mogen regel a niet laten afgaan; Sophie in de eigen body wel.
const disclosure = '<header><aside class="ontdek-promo"><p>Twaalf streken bezocht ik zelf, daar staat wat ik proefde. Zelf gereisd</p></aside></header>';
const ontdek = (t) => `<section class="content-links"><section class="content-links__group"><a href="/x/">${t}</a></section></section>`;

test('regel a: disclosure-ik-zin en Ontdek verder buiten de body geven geen overtreding', () => {
  withDir({ 'index.html': makeHtml(`${disclosure}<article data-page-tier="redactiegids"><p>De Douro is steil.</p>${ontdek('Wat Marijn &amp; Sophie eten')}</article>`) }, (dir) => {
    const { out } = runLint(dir, true);
    assert.match(out, /"redactiegids": 1/);
    assert.doesNotMatch(out, /\[a\]/);
  });
});

test('regel a: Sophie in de body van een Redactiegids-pagina blijft rood', () => {
  withDir({ 'index.html': makeHtml(`${disclosure}<article data-page-tier="redactiegids"><div class="article-prose"><p>Sophie kiest bij Muga altijd de Reserva.</p></div>${ontdek('x')}</article>`) }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.match(out, /\[a\].*Sophie/);
    assert.equal(exit, 1);
  });
});

test('regel a: passief "wordt geproefd" is geen bezoekclaim, "we proefden" wel', () => {
  withDir({ 'index.html': makeHtml('<article data-page-tier="redactiegids"><p>De lava wordt niet rechtstreeks geproefd.</p></article>'),
    'b.html': makeHtml('<article data-page-tier="redactiegids"><p>De 2018 die we proefden was amber.</p></article>') }, (dir) => {
    const { out } = runLint(dir, true);
    assert.equal((out.match(/^\[a\]/gm) || []).length, 1);
    assert.match(out, /we proefden/);
  });
});

// LAT-12964 stap 4: accommodatienamen met " - " zijn eigennamen; een gewone gedachtestreep niet.
test('regel d: accommodatienaam met spatie-koppelteken is geen overtreding, titelstreep wel', () => {
  withDir({ 'index.html': makeHtml('<h3 class="acc-kaart__name">Pieve Aldina - Relais &amp; Châteaux</h3><p>Pieve Aldina - Relais &amp; Châteaux ligt in Radda. Drinkrijp Nu – 2035.</p>'),
    'b.html': makeHtml('<h1>Waar slapen in de Langhe - van agriturismo tot estate</h1>') }, (dir) => {
    const { out } = runLint(dir, true);
    assert.equal((out.match(/^\[d\]/gm) || []).length, 1);
    assert.match(out, /Langhe - van/);
  });
});

// LAT-12964: noindex-pagina's (intern dashboard, infographic-preview) vallen buiten de lint,
// een indexeerbare pagina met dezelfde fout niet.
test('noindex-pagina wordt overgeslagen, indexeerbare niet', () => {
  const noindex = '<!doctype html><html><head><meta name="robots" content="noindex, nofollow"><title>T</title></head><body>Preview LAT-1108 — test</body></html>';
  withDir({ 'a.html': noindex }, (dir) => {
    const { exit, out } = runLint(dir);
    assert.equal(exit, 0, out);
    assert.match(out, /"noindex": 1/);
  });
  withDir({ 'a.html': noindex.replace(/<meta name="robots"[^>]*>/, '') }, (dir) => {
    assert.equal(runLint(dir).exit, 1);
  });
});
