// LAT-12028 — redtest voor scripts/lint-authenticiteit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function makeHtml(body, badge = '') {
  return `<!doctype html><html><head><title>Test</title></head><body>${badge}${body}</body></html>`;
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
  withDir({ 'index.html': makeHtml('<span class="badge">Redactiegids</span><p>We sliepen in een charmant hotel.</p>') }, (dir) => {
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
