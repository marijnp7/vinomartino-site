#!/usr/bin/env node
/**
 * LAT-14740 — post-build gate: geen Nederlandse plaats- of landnaam in het bezoekblok
 * (`section#bezoek`) van een EN-wijnhuisportret (HARDE REGEL 20).
 *
 * Draait NA `astro build` over `dist/en/wijnhuizen/<slug>/index.html`. Exit 1 bij een treffer,
 * tenzij `--report` (alleen melden, exit 0). De lijst hieronder is een detectorlijst, geen
 * vertaallijst: de EN-waarde komt uit Directus `wijnhuizen_translations.address`.
 *
 * Aanleiding: build 1609, 29 van 127 EN-portretten met o.a. "Kaapstad", "Italië", "Toscane".
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NL_NAMES = [
  'Kaapstad', 'Zuid-Afrika', 'Frankrijk', 'Italië', 'Spanje', 'Duitsland', 'Oostenrijk', 'Slowakije',
  'Hongarije', 'Zwitserland', 'Griekenland', 'Georgië', 'Toscane', 'Piëmont', 'Bourgogne', 'Sicilië',
  'Sardinië', 'Catalonië', 'Moezel', 'Zuid-Tirol', 'Wenen', 'Lissabon',
];
const NAME_RE = new RegExp(`(?<![\\p{L}-])(${NL_NAMES.join('|')})(?![\\p{L}-])`, 'gu');

const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

/** NL-namen in de zichtbare tekst van section#bezoek; [] als het blok ontbreekt. */
export function findNlNamesInBezoek(html) {
  const m = html.match(/<section\b[^>]*\bid="bezoek"[\s\S]*?<\/section>/);
  if (!m) return [];
  const text = decode(m[0].replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
  return [...new Set([...text.matchAll(NAME_RE)].map((x) => x[1]))];
}

async function main() {
  const report = process.argv.includes('--report');
  const root = join(process.cwd(), 'dist', 'en', 'wijnhuizen');
  const slugs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const hits = [];
  let n = 0;
  for (const slug of slugs) {
    const html = await readFile(join(root, slug, 'index.html'), 'utf8').catch(() => null);
    if (html === null) continue;
    n += 1;
    const names = findNlNamesInBezoek(html);
    if (names.length) hits.push(`${slug}: ${names.join(', ')}`);
  }
  console.log(`[en-wijnhuis-adres] ${hits.length} van ${n} EN-portretten met NL-naam in #bezoek`);
  for (const h of hits) console.log(`  ${h}`);
  if (hits.length && !report) {
    console.error('[en-wijnhuis-adres] FAIL: vul wijnhuizen_translations.address (EN) voor deze huizen (LAT-14740).');
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
