#!/usr/bin/env node
/**
 * LAT-14551 — post-build tierlabel-gate.
 *
 * Draait NA `astro build` over `dist/**\/*.html` en faalt de deploy (exit 1) bij:
 *
 *   1. los-label: een tiernaam ("Slim geboekt", "Prijs-kwaliteit", "Pure luxe",
 *      EN "Smart booking", "Great value", "Pure luxury") staat als label in de
 *      HTML zonder `stay-tier-icon` in hetzelfde element. Een label is een
 *      tekstknoop die (afgezien van een teller "(3)") alleen uit de tiernaam
 *      bestaat; lopende tekst ("de Pure luxe-keuze") en nadruk in CMS-tekst
 *      (<strong>Pure luxe</strong>: …) tellen niet mee.
 *   2. dubbel-label: binnen een tiergroep (`section.acc-roundup__category` of
 *      een element met `data-stay-tier-group`) staat buiten de groepskop nog een
 *      tierlabel op een kaart (LAT-14496: groepskop met icoon, kaart zonder badge).
 *
 * Aanleiding: Marijn 22-10, LAT-14549. De roundup had iconen, streek-, route-,
 * accommodatie- en wijnhuispagina's nog tekstbadges. Eén component
 * (StayTierLabel) + deze gate zorgen dat een losse badge niet terugkomt.
 *
 * Bewust afhankelijkheidsvrij: een kleine tag-tokenizer, geen parse5 (die zit
 * alleen transitief in node_modules).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TIER_NAMES = [
  'Slim geboekt', 'Prijs-kwaliteit', 'Pure luxe',
  'Smart booking', 'Great value', 'Pure luxury',
  'Value for money', // oude EN-term voor prijs_kwaliteit, mag ook niet los terugkomen
];

// Nadruk in lopende CMS-tekst ("<p><strong>Pure luxe</strong>: estate-hotels …")
// is geen UI-label; die tekst komt uit Directus en hoort niet in deze gate.
const PROSE_EMPHASIS = new Set(['strong', 'b', 'em', 'i']);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'template', 'noscript', 'textarea']);

function decode(s) {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&#45;|&#x2d;/gi, '-')
    .replace(/&amp;/g, '&');
}

function classOf(attrs) {
  const m = attrs.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
}

function tierNameOf(text) {
  const t = decode(text).replace(/\s+/g, ' ').trim().replace(/\s*\(\d+\)$/, '');
  return TIER_NAMES.find((n) => n.toLowerCase() === t.toLowerCase()) ?? null;
}

/** Scan één HTML-document. Geeft een lijst bevindingen {kind, label, context}. */
export function scanHtml(html) {
  const findings = [];
  const stack = [];
  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)([^>]*)>|[^<]+/g;
  let m;
  const inGroup = () => stack.some((e) => e.group);
  const inGroupHead = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].group) return false;
      if (stack[i].head) return true;
    }
    return false;
  };
  const ctx = (i) => html.slice(Math.max(0, i - 160), i + 60).replace(/\s+/g, ' ');

  while ((m = tokenRe.exec(html))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (tok.startsWith('<')) {
      const tag = m[1].toLowerCase();
      const attrs = m[2] || '';
      if (tok.startsWith('</')) {
        const idx = stack.map((e) => e.tag).lastIndexOf(tag);
        if (idx !== -1) stack.length = idx;
        continue;
      }
      const cls = classOf(attrs);
      const classes = cls.split(/\s+/);
      if (classes.includes('stay-tier-icon')) {
        // Het icoon telt voor het element waar het in staat (de label-span / kop).
        if (stack.length) stack[stack.length - 1].icon = true;
      }
      if (inGroup() && !inGroupHead() && classes.some((c) => c === 'stay-tier-label' || c.startsWith('stay-tier-label--'))) {
        findings.push({ kind: 'dubbel-label', label: 'stay-tier-label', context: ctx(m.index) });
      }
      const selfClosing = /\/\s*$/.test(attrs) || VOID.has(tag);
      if (RAW.has(tag) && !selfClosing) {
        const close = html.toLowerCase().indexOf(`</${tag}`, tokenRe.lastIndex);
        tokenRe.lastIndex = close === -1 ? html.length : close;
        continue;
      }
      if (selfClosing) continue;
      stack.push({
        tag,
        icon: false,
        group: classes.includes('acc-roundup__category') || /\bdata-stay-tier-group\b/i.test(attrs),
        head: tag === 'header' || /^h[1-6]$/.test(tag) || classes.some((c) => c.endsWith('-head')),
      });
      continue;
    }
    const label = tierNameOf(tok);
    if (!label || !stack.length) continue;
    const parent = stack[stack.length - 1];
    if (parent.tag === 'title' || PROSE_EMPHASIS.has(parent.tag)) continue;
    if (inGroup() && !inGroupHead()) {
      findings.push({ kind: 'dubbel-label', label, context: ctx(m.index) });
    } else if (!parent.icon) {
      findings.push({ kind: 'los-label', label, context: ctx(m.index) });
    }
  }
  return findings;
}

async function* walkHtml(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

export async function scanDist(distDir) {
  const out = [];
  let files = 0;
  for await (const file of walkHtml(distDir)) {
    files++;
    for (const f of scanHtml(await readFile(file, 'utf8'))) out.push({ file: relative(distDir, file), ...f });
  }
  return { files, findings: out };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const distDir = process.argv[2] || process.env.DIST_DIR || 'dist';
  const { files, findings } = await scanDist(distDir);
  if (files === 0) {
    console.error(`[check-stay-tier-labels] FAIL: geen HTML in ${distDir} (lege scan is geen groen)`);
    process.exit(1);
  }
  if (findings.length) {
    console.error(`[check-stay-tier-labels] FAIL: ${findings.length} tierlabel(s) zonder icoon of dubbel in een tiergroep (LAT-14551).`);
    console.error('Gebruik src/components/StayTierLabel.astro; binnen een tiergroep geen badge op de kaart.');
    for (const f of findings.slice(0, 50)) console.error(`  ${f.kind}  ${f.file}  "${f.label}"  …${f.context}…`);
    if (findings.length > 50) console.error(`  … en nog ${findings.length - 50}`);
    process.exit(1);
  }
  console.log(`[check-stay-tier-labels] OK: ${files} HTML-bestanden, geen losse of dubbele tierlabels.`);
}
