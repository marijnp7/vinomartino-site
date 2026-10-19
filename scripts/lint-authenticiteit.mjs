#!/usr/bin/env node
/**
 * LAT-12028 — Authenticiteits-lint als build-script.
 *
 * Controleert de gebouwde HTML op zeven regels (a t/m g, PAPERCLIP_CAPACITEIT sectie 8):
 *   a  Op Redactiegids-pagina's: geen eerste persoon VT, geen Sophie, geen
 *      "geproefd"/"we sliepen"/"we zaten".
 *   b  Op Zelf-gereisd-pagina's: ooggetuige-zinnen alleen over plaatsen uit plaatsen.yml.
 *   c  Geen Tier\d, "Draft v", "LAT-\d+", gelekte interne labels.
 *   d  Geen em-dash/en-dash als gedachtestreep en geen spatie-koppelteken-spatie in
 *      titels en lopende tekst (bereiken als "80-125" blijven toegestaan).
 *   e  Alleen "Marijn", nooit "Martin", nooit "WSET 4".
 *   f  Op Zelf-gereisd-pagina's: elke ooggetuige-zin draagt [bron: RS-<id>] OF
 *      [bron: marijn YYYY-MM-DD] (HARDE REGEL 57, herzien 2026-10-03), ook als
 *      data-bron="..." met dezelfde waarde; ontbreekt die markering, dan is dat een
 *      lint-overtreding (het blokkeert de build niet in --lenient; zonder --lenient is
 *      het een fatale fout). Een zin met geldige markering is ook vrij van regel b.
 *      Meningen zonder bezoekclaim ("hier zou ik slapen") zijn geen ooggetuige-zin.
 *   g  Geen "Sophie" in FAQ-blokken.
 *
 * Gebruik:
 *   node scripts/lint-authenticiteit.mjs [dist-dir] [--lenient]
 *   node scripts/lint-authenticiteit.mjs dist --lenient
 *
 * Stappenplan:
 * 1. Leest bezocht.yml voor de lijst van bezochte streken.
 * 2. Leest plaatsen.yml voor de plaatsnamen per streek.
 * 3. Wandelt dist/**\/*.html.
 * 4. Bepaalt per pagina de tier via data-page-tier op de pagina-root (LAT-12964); regel
 *    a/b/f scannen alleen die root, zonder het gedeelde blok Ontdek verder.
 * 5. Past de zeven regels toe en rapporteert overtredingen.
 * Exit 0 = 0 overtredingen. Exit 1 = overtredingen gevonden.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = process.env.DIST_DIR
  || process.argv.slice(2).find((a) => !a.startsWith('-')) || 'dist';
const LENIENT = process.argv.includes('--lenient');

// --- YAML mini-parser (geen externe deps) ---
function parseYamlStringList(text) {
  const result = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s+-\s+(.+)/);
    if (m) result.push(m[1].trim());
  }
  return result;
}

function parseYamlPlaces(text) {
  const result = {};
  let current = null;
  for (const line of text.split('\n')) {
    if (line.match(/^#/)) continue;
    const section = line.match(/^([A-Za-z\s]+):\s*$/);
    if (section) { current = section[1].trim(); result[current] = []; continue; }
    const item = line.match(/^\s+-\s+(.+)/);
    if (item && current) result[current].push(item[1].trim());
  }
  return result;
}

let BEZOCHTE_STREKEN = [];
let PLAATSEN = {};
try {
  const bezocht = await readFile('bezocht.yml', 'utf8');
  const strekenSection = bezocht.split(/^streken:/m)[1]?.split(/^[a-z]/m)[0] || '';
  BEZOCHTE_STREKEN = parseYamlStringList(strekenSection);
} catch { console.warn('WARN: bezocht.yml niet gevonden; regel b en f worden overgeslagen'); }

try {
  const plaatsen = await readFile('plaatsen.yml', 'utf8');
  PLAATSEN = parseYamlPlaces(plaatsen);
} catch { console.warn('WARN: plaatsen.yml niet gevonden; regel b wordt overgeslagen'); }

// Alle plaatsnamen plat, voor regex
const ALLE_PLAATSEN = Object.values(PLAATSEN).flat();

// --- HTML helpers ---
function innerText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1] : '';
}

// Geldige markering: RS-<id> of "marijn YYYY-MM-DD" (echte kalenderdatum).
function isGeldigeBron(waarde) {
  const v = waarde.trim();
  if (/^RS-[A-Za-z0-9_-]+$/i.test(v)) return true;
  const m = v.match(/^marijn\s+(\d{4})-(\d{2})-(\d{2})$/i);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function heeftGeldigeBron(tekst) {
  return [...tekst.matchAll(/\[bron:\s*([^\]]*)\]/gi)].some((m) => isGeldigeBron(m[1]));
}

// data-bron="..." wordt als zichtbare [bron: ...] voor de tekstvergelijking geplaatst.
function metBronAttributen(html) {
  return html.replace(/<([a-z][^>]*?)\sdata-bron="([^"]*)"([^>]*)>/gi, '<$1$3> [bron: $2] ');
}

// LAT-12964 — tier komt uit het attribuut data-page-tier op de pagina-root (ArtikelDetail,
// StreekDetail; waarde uit Directus zelf_gereisd), nooit uit vrije tekst. De tekst
// "Zelf gereisd" staat ook in nav, legenda, filters en kaarten van andere pagina's;
// daarop matchen maakte 323 van 329 pagina's Tier 1 en regel a blind.
// Geen attribuut = pagina zonder eigen tier (index, home, overzicht): a/b/f slaan over.
function paginaTier(html) {
  const m = html.match(/\sdata-page-tier="(zelf-gereisd|redactiegids)"/i);
  return m ? m[1].toLowerCase() : null;
}

// LAT-12964 stap 3 — regel a/b/f lezen alleen de eigen redactionele tekst: het element met
// data-page-tier (de <article>-root van ArtikelDetail/StreekDetail), zonder het gedeelde
// blok "Ontdek verder" (section.content-links). Gedeelde blokken buiten die root (header
// met de disclosure-promo "Twaalf streken bezocht ik zelf…", nav, footer) gaven op vrijwel
// elke Redactiegids-pagina een vals regel-a-signaal.
// Einde van het element dat op `start` opent, met nesting van dezelfde tag meegeteld.
function eindVanElement(html, start, tag) {
  const rx = new RegExp(`<(\\/?)${tag}\\b[^>]*>`, 'gi');
  rx.lastIndex = start;
  let depth = 0;
  for (let m; (m = rx.exec(html));) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return html.length;
}

function paginaScope(html) {
  const start = html.search(/<article\b[^>]*\sdata-page-tier="/i);
  if (start < 0) return '';
  let scope = html.slice(start, eindVanElement(html, start, 'article'));
  for (let i; (i = scope.search(/<section\b[^>]*class="[^"]*\bcontent-links\b/i)) >= 0;) {
    scope = scope.slice(0, i) + ' ' + scope.slice(eindVanElement(scope, i, 'section'));
  }
  return scope;
}

// LAT-12964 stap 4 — regel d: accommodatienamen ("Pieve Aldina - Relais & Châteaux",
// "Franschhoek Boutique Hotel – Lion Roars") zijn eigennamen uit de partnerdata, geen
// gedachtestreep. Namen uit de accommodatiekaarten worden vóór regel d gemaskeerd, ook
// waar dezelfde naam in lopende tekst staat. Overige " - " in titels en tekst blijft rood.
function accommodatieNamen(html) {
  const out = new Set();
  for (const m of html.matchAll(/<(h[1-6]|p|span|a)\b[^>]*class="[^"]*\b(?:poi-card__name|acc-kaart__name)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const naam = innerText(m[2]).replace(/&#39;/g, "'").trim();
    if (/\s[-–]\s/.test(naam)) out.add(naam);
  }
  return [...out].sort((x, y) => y.length - x.length);
}

function hasFaqSection(html) {
  return /<div[^>]*faq|<section[^>]*faq|<dl|<details/i.test(html);
}

function faqText(html) {
  const out = [];
  for (const m of html.matchAll(/<(?:div|section|dl|details)[^>]*(?:faq|question|answer)[^>]*>([\s\S]*?)(?=<\/(?:div|section|dl|details)>)/gi)) {
    out.push(innerText(m[1]));
  }
  return out.join(' ');
}

// --- Walker ---
const SKIP_TOP = new Set(['preview', 'en']);
async function* walk(dir, top = true) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (top && e.isDirectory() && SKIP_TOP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, false);
    else if (e.name.endsWith('.html')) yield p;
  }
}

// --- Lint-regels ---
const violations = [];
function report(rel, rule, detail) {
  violations.push({ rel, rule, detail });
  if (!LENIENT && (rule === 'f')) {
    console.error(`FATAL [${rule}] ${rel}: ${detail}`);
  }
}

const stats = { pages: 0, zelfGereisd: 0, redactiegids: 0, zonderTier: 0 };

for await (const file of walk(DIST)) {
  const html = await readFile(file, 'utf8');
  const rel = '/' + relative(DIST, file).replace(/index\.html$/, '').replace(/\\/g, '/');
  const text = innerText(html);
  const title = extractTitle(html);
  const tier = paginaTier(html);
  const zg = tier === 'zelf-gereisd';
  const gids = tier === 'redactiegids';
  stats.pages++;
  if (zg) stats.zelfGereisd++; else if (gids) stats.redactiegids++; else stats.zonderTier++;

  // c: interne labels / conceptresten
  for (const [pattern, label] of [
    [/\bTier\s*[123]\b/g, 'Tier-label'],
    [/\bDraft\s+v\d/gi, 'Draft-label'],
    [/\bLAT-\d{3,}\b/g, 'Ticketnummer'],
  ]) {
    const matches = [...text.matchAll(pattern)];
    for (const m of matches) {
      const ctx = text.slice(Math.max(0, m.index - 60), m.index + 60).trim();
      report(rel, 'c', `${label}: "${ctx}"`);
    }
  }

  // d: gedachtestreep en spatie-koppelteken-spatie.
  // Em-dash (—) is altijd een gedachtestreep.
  // En-dash (–) is een gedachtestreep als hij NIET een bereik aangeeft. Bereiken zijn:
  //   getal–getal (bijv. 80–125), Woord–Woord met hoofdletter (bijv. Mei–Juni, Frankfurt–Mainz).
  // Spatie-koppelteken-spatie ( - ) is verboden als gedachtestreep; bereiken zijn altijd
  //   getal-koppelteken-getal (al afgevangen door de anchor) of hotelnaamparen — die echter
  //   altijd in naam-tekst staan zonder spaties rondom als bereik, dus spatie - spatie is verboden.
  let fullText = (title + ' ' + text).replace(/&#39;/g, "'");
  for (const naam of accommodatieNamen(html)) fullText = fullText.split(naam).join(' ');

  // Em-dash: altijd verboden
  for (const m of fullText.matchAll(/—/g)) {
    const ctx = fullText.slice(Math.max(0, m.index - 40), m.index + 40).trim();
    report(rel, 'd', `em-dash (—): "…${ctx}…"`);
  }
  // En-dash: verboden tenzij het een bereik is (getal–getal, maand–maand, plaatsnaam–plaatsnaam).
  // "Bereik": het teken direct voor en na de dash is een cijfer, valutasymbool, of een lettereeks
  // (woord – ook met kleine letter, bijv. "november–maart", "Frankfurt–Mainz").
  for (const m of fullText.matchAll(/–/g)) {
    const before = fullText.slice(Math.max(0, m.index - 4), m.index);
    const after  = fullText.slice(m.index + 1, m.index + 5);
    // "Nu – 2035", "2019 – 2024": een bereik met spaties naar een jaartal/getal.
    const isBereik = /[0-9€$]\s?$/.test(before) || /^\s?[0-9€$]/.test(after)
      || (/[a-zA-ZÀ-ÖØ-öø-ÿ]$/.test(before) && /^[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(after));
    if (!isBereik) {
      const ctx = fullText.slice(Math.max(0, m.index - 40), m.index + 40).trim();
      report(rel, 'd', `en-dash als gedachtestreep (–): "…${ctx}…"`);
    }
  }
  // Spatie-koppelteken-spatie: verboden als gedachtestreep
  for (const m of fullText.matchAll(/[a-zA-Zà-ÿ'] - [a-zA-Zà-ÿ']/g)) {
    const ctx = fullText.slice(Math.max(0, m.index - 40), m.index + 40).trim();
    report(rel, 'd', `spatie-koppelteken-spatie: "…${ctx}…"`);
  }

  // e: Martin / WSET 4
  for (const [rx, label] of [
    [/\bMartin\b/g, '"Martin" (moet "Marijn" zijn)'],
    [/\bWSET\s*4\b/gi, '"WSET 4" (nooit vermelden)'],
  ]) {
    const m = text.match(rx);
    if (m) report(rel, 'e', label);
  }

  const scopeText = innerText(paginaScope(html));

  if (gids) {
    const text = scopeText;
    // a: Redactiegids — geen eerste persoon VT, geen Sophie, geen "geproefd"/"we sliepen"/"we zaten"
    const vtPatterns = [
      /\b(ik|we|wij)\s+(sliep|sliepen|at|aten|proefde[n]?|bezocht[e]?|dronk|dronken|zag|zagen|reed|reden|liep|liepen|stond|stonden)\b/gi,
      // "geproefd" alleen met een eerste persoon in dezelfde zin; passief ("wordt geproefd",
      // "als het is geproefd") is geen bezoekclaim (LAT-12964).
      /\b(?:ik|we|wij|mijn|ons|onze)\b[^.!?:]{0,80}\bgeproefd\b|\bgeproefd\b[^.!?]{0,80}\b(?:ik|we|wij|mijn)\b/gi,
      /\bwe\s+sliepen\b/gi,
      /\bwe\s+zaten\b/gi,
      /\bwe\s+aten\b/gi,
    ];
    for (const rx of vtPatterns) {
      const matches = [...text.matchAll(rx)];
      for (const m of matches) {
        const ctx = text.slice(Math.max(0, m.index - 60), m.index + 60).trim();
        report(rel, 'a', `eerste persoon VT op Redactiegids: "…${ctx}…"`);
      }
    }
    // Sophie op Redactiegids
    if (/\bSophie\b/.test(text)) report(rel, 'a', '"Sophie" op Redactiegids-pagina');
  }

  if (zg && ALLE_PLAATSEN.length > 0) {
    // b + f: ooggetuige-zinnen (eerste persoon VT = bezoekclaim). Meningen als "hier zou ik
    // slapen" matchen niet. Een geldige bron-markering (RS-id of marijn datum) is het bewijs
    // en maakt de zin vrij van b en f.
    const bronText = innerText(metBronAttributen(paginaScope(html)));
    const vtRx = /[^.!?]*\b(ik|we|wij)\s+(sliep|sliepen|at|aten|proefde[n]?|bezocht[e]?|dronk|dronken|zag|zagen)\b[^.!?]*/gi;
    for (const m of bronText.matchAll(vtRx)) {
      const zin = m[0];
      const venster = bronText.slice(Math.max(0, m.index - 200), m.index + zin.length + 200);
      if (heeftGeldigeBron(venster)) continue;
      const heeftPlaats = ALLE_PLAATSEN.some((p) => zin.toLowerCase().includes(p.toLowerCase()));
      if (!heeftPlaats) {
        report(rel, 'b', `ooggetuige-zin zonder bekende plaats: "…${zin.trim().slice(0, 120)}…"`);
      }
      report(rel, 'f', `ooggetuige-zin zonder [bron: RS-id] of [bron: marijn YYYY-MM-DD]: "…${zin.trim().slice(0, 100)}…"`);
    }
  }

  // g: Sophie in FAQ-blokken
  if (hasFaqSection(html)) {
    const ft = faqText(html);
    if (/\bSophie\b/.test(ft)) report(rel, 'g', '"Sophie" in FAQ-blok');
  }
}

// --- Rapport ---
console.log(JSON.stringify({
  pages: stats.pages,
  zelfGereisd: stats.zelfGereisd,
  redactiegids: stats.redactiegids,
  zonderTier: stats.zonderTier,
  violations: violations.length,
  byRule: violations.reduce((acc, v) => { acc[v.rule] = (acc[v.rule] || 0) + 1; return acc; }, {}),
  lenient: LENIENT,
}, null, 2));

// Met --lenient: alleen rapporteren, nooit blokkeren (exit 0).
// Zonder --lenient: elke overtreding blokkeert (exit 1).
violations.slice(0, 80).forEach((v) => console.log(`[${v.rule}] ${v.rel}: ${v.detail}`));
if (violations.length > 80) console.log(`… en ${violations.length - 80} meer`);

if (!LENIENT && violations.length > 0) {
  process.exit(1);
}
