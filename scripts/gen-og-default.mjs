#!/usr/bin/env node
/**
 * gen-og-default.mjs — genereert public/og-default.png (1200×630)
 *
 * LAT-4755. Op LAT-4754 is gemeten dat 34 van de 546 live-URLs géén `og:image`
 * hadden: de keten was `og_image` → `hero_image` → niets. Pagina's zonder eigen
 * beeld (index- en utility-pagina's, en artikelen waarvan de hero bewust op null
 * staat) verloren daardoor stilzwijgend hun deelkaart. SiteLayout.astro valt nu
 * terug op de hier gegenereerde merkkaart.
 *
 * Bewust géén foto: het beeld is puur typografie + het beeldmerk uit favicon.svg,
 * in de tokens uit src/styles/tokens.css. Zo doet de kaart geen enkele uitspraak
 * over de inhoud van de pagina waar hij bij hoort, en valt er niets te
 * verantwoorden onder de beeld-herkomstregels (PROJECT_BRIEF §7).
 *
 * De PNG is een *gecommit artefact* — de build heeft dit script niet nodig en
 * dus ook geen fonts. Dit script bestaat om de kaart reproduceerbaar te maken:
 *
 *   node scripts/gen-og-default.mjs
 *
 * Het haalt de twee webfonts op die de site zelf ook laadt (Cormorant Garamond
 * italic voor het woordmerk, Inter voor de onderregels) en zet een tijdelijke
 * fontconfig op, omdat de renderer van sharp anders zonder fonts stilletjes een
 * lege plaat oplevert. Draai het opnieuw wanneer het woordmerk of de palette
 * verandert, en commit de nieuwe PNG.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const OUT = resolve(REPO, 'public/og-default.png');

// Tokens uit src/styles/tokens.css. --fixed-cream/--gold/--rule zijn de tonen die
// daar expliciet zijn aangewezen voor tekst op een permanent verzadigd merkvlak.
const BURGUNDY = '#5A1A1F';
const BURGUNDY_DEEP = '#3D1115';
const CREAM = '#FAF5E9';
const GOLD = '#E5C99B';
const RULE = '#C9B98F';
const RUST = '#A14F2A';

const WIDTH = 1200;
const HEIGHT = 630;

// Google Fonts levert per user-agent een ander formaat; deze UA geeft TTF, wat
// de renderer van sharp aankan.
const UA = 'Mozilla/5.0 (X11; Linux x86_64)';
const FONT_CSS =
  'https://fonts.googleapis.com/css2' +
  '?family=Cormorant+Garamond:ital,wght@1,500' +
  '&family=Inter:wght@400' +
  '&display=swap';

/** Haalt de TTF's op waar de @font-face-regels naar wijzen. */
async function fetchFonts(dir) {
  const css = await (await fetch(FONT_CSS, { headers: { 'User-Agent': UA } })).text();
  const urls = [...new Set(css.match(/https:\/\/[^)]+\.ttf/g) ?? [])];
  if (urls.length < 2) {
    throw new Error(`verwachtte 2 TTF-urls in de Google-Fonts-CSS, kreeg ${urls.length}`);
  }
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`font ${url} gaf ${res.status}`);
    writeFileSync(join(dir, `font-${i}.ttf`), Buffer.from(await res.arrayBuffer()));
  }
  return urls.length;
}

/**
 * De renderer van sharp (librsvg) leest fonts via fontconfig, en in een kale
 * container is er geen config — dan rendert `<text>` niets, zónder foutmelding.
 * We wijzen hem daarom expliciet naar de zojuist opgehaalde fonts.
 */
function fontconfig(dir) {
  const file = join(dir, 'fonts.conf');
  writeFileSync(
    file,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${dir}</dir>
  <cachedir>${join(dir, 'cache')}</cachedir>
</fontconfig>
`,
  );
  return file;
}

function svg() {
  // Beeldmerk uit public/favicon.svg (viewBox 64×64), zonder het cream vlakje:
  // op het burgundy veld dragen de glas-vormen zelf de goudtoon.
  const markScale = 3;
  const markSize = 64 * markScale;
  const markX = (WIDTH - markSize) / 2;
  const markY = 106;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="veld" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#6B2228"/>
      <stop offset="1" stop-color="${BURGUNDY_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BURGUNDY}"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#veld)"/>
  <rect x="44" y="44" width="${WIDTH - 88}" height="${HEIGHT - 88}" fill="none"
        stroke="${RULE}" stroke-opacity="0.45" stroke-width="1.5"/>

  <g transform="translate(${markX} ${markY}) scale(${markScale})">
    <g transform="translate(0,1)">
      <path d="M20 12 H44 C44 26 38 32 32 32 C26 32 20 26 20 12 Z" fill="${GOLD}"/>
      <path d="M22 14 H42 C42 18 38 21 32 21 C26 21 22 18 22 14 Z" fill="${RUST}" opacity="0.9"/>
      <rect x="30.5" y="32" width="3" height="14" fill="${RULE}"/>
      <rect x="20" y="46" width="24" height="3" rx="1.5" fill="${RULE}"/>
    </g>
    <circle cx="48" cy="18" r="3" fill="${RUST}"/>
  </g>

  <text x="${WIDTH / 2}" y="424" text-anchor="middle" fill="${CREAM}"
        font-family="Cormorant Garamond" font-size="104" font-weight="500" font-style="italic"
        >Vino<tspan font-style="normal">&#183;</tspan>Martino</text>

  <line x1="${WIDTH / 2 - 140}" y1="466" x2="${WIDTH / 2 + 140}" y2="466"
        stroke="${RULE}" stroke-opacity="0.7" stroke-width="1.5"/>

  <text x="${WIDTH / 2}" y="516" text-anchor="middle" fill="${GOLD}"
        font-family="Inter" font-size="28" font-weight="400" letter-spacing="2.5"
        >Wijnreis-verhalen, routes en proefnotities</text>

  <text x="${WIDTH / 2}" y="566" text-anchor="middle" fill="${RULE}" fill-opacity="0.65"
        font-family="Inter" font-size="22" font-weight="400" letter-spacing="4"
        >vinomartino.com</text>
</svg>
`;
}

const dir = mkdtempSync(join(tmpdir(), 'vm-og-default-'));
try {
  const n = await fetchFonts(dir);
  const conf = fontconfig(dir);
  const svgPath = join(dir, 'card.svg');
  writeFileSync(svgPath, svg());

  // sharp leest fontconfig één keer bij het laden van de renderer, dus de env-var
  // moet al staan vóór het proces dat rendert — vandaar een kindproces.
  const render = `
    import sharp from 'sharp';
    import { readFileSync, writeFileSync } from 'node:fs';
    const png = await sharp(readFileSync(${JSON.stringify(svgPath)}))
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(${JSON.stringify(OUT)}, png);
    const meta = await sharp(png).metadata();
    const stats = await sharp(png).stats();
    // Een lege plaat is de stille faalmodus hier: als de fonts niet laden rendert
    // librsvg de tekst weg en levert nog steeds een geldige PNG op. Daarom een
    // ondergrens op de spreiding in plaats van alleen "bestand geschreven".
    const spread = Math.max(...stats.channels.map((c) => c.stdev));
    console.log(JSON.stringify({ w: meta.width, h: meta.height, bytes: png.length, spread: +spread.toFixed(2) }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', render], {
    cwd: REPO,
    env: { ...process.env, FONTCONFIG_FILE: conf },
    encoding: 'utf8',
  });
  const res = JSON.parse(out.trim().split('\n').pop());
  if (res.w !== WIDTH || res.h !== HEIGHT) {
    throw new Error(`verkeerde afmetingen: ${res.w}×${res.h}, verwacht ${WIDTH}×${HEIGHT}`);
  }
  if (res.spread < 10) {
    throw new Error(`kaart lijkt leeg (spreiding ${res.spread}) — fonts niet geladen?`);
  }
  console.log(`${OUT}: ${res.w}×${res.h}, ${res.bytes} bytes, ${n} fonts, spreiding ${res.spread}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
