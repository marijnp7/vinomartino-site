#!/usr/bin/env node
/**
 * LAT-12768 — bouwcheck: elke <img> in dist/**\/*.html heeft width + height (of een inline
 * aspect-ratio). Draait ná optimize-images, dat width/height uit de bronbestanden bijzet.
 * Uitzondering per tag: data-dim-exempt (bv. tracking-pixels). Exit 1 bij overtredingen.
 * Gebruik: node scripts/check-img-dimensions.mjs [dist] [--report]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW_FILE = join(fileURLToPath(new URL('.', import.meta.url)), 'img-dimensions-allowlist.json');
const allowed = () => (existsSync(ALLOW_FILE) ? new Set(Object.keys(JSON.parse(readFileSync(ALLOW_FILE, 'utf8')))) : new Set());

const IMG_RE = /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2]) : null;
};

export function imgViolations(html) {
  const out = [];
  for (const tag of html.match(IMG_RE) ?? []) {
    if (/\sdata-dim-exempt(?:[\s=>]|$)/i.test(tag)) continue;
    const w = Number(attr(tag, 'width'));
    const h = Number(attr(tag, 'height'));
    if (w > 0 && h > 0) continue;
    if (/aspect-ratio\s*:/i.test(attr(tag, 'style') ?? '')) continue;
    out.push(tag.length > 200 ? `${tag.slice(0, 200)}…` : tag);
  }
  return out;
}

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.html')) acc.push(p);
  }
  return acc;
}

export function checkDist(dist) {
  const bad = [];
  const skip = allowed();
  let imgs = 0;
  for (const f of walk(dist)) {
    const html = readFileSync(f, 'utf8');
    imgs += (html.match(IMG_RE) ?? []).length;
    if (skip.has(relative(dist, f))) continue;
    for (const tag of imgViolations(html)) bad.push({ file: relative(dist, f), tag });
  }
  return { imgs, bad };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'dist';
  const { imgs, bad } = checkDist(dist);
  if (bad.length === 0) {
    console.log(`[check-img-dimensions] OK: ${imgs} <img> zonder maatloze tags.`);
  } else {
    console.error(`[check-img-dimensions] FAALT: ${bad.length} van ${imgs} <img> zonder width/height (of aspect-ratio):`);
    for (const b of bad.slice(0, process.argv.includes('--report') ? bad.length : 25)) console.error(`  - ${b.file}: ${b.tag}`);
    process.exit(1);
  }
}
