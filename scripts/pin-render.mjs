#!/usr/bin/env node
// LAT-11988: pincompositie. Eigen foto onbewerkt bovenin (alleen bijgesneden op
// 1000x1000), tekstvlak eronder met de paginatitel. Geen beeldmodel.
//
// Draait als kindproces met FONTCONFIG_FILE al gezet: librsvg leest fonts één keer
// bij het laden en tekent zonder fontconfig stilletjes geen tekst. Daarom toetst
// dit script op pixels dat het tekstvlak niet leeg is.
//
// Gebruik: node scripts/pin-render.mjs <jobs.json>   ([{ src, out, title }])

import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 1000;
const H = 1500;
const PHOTO_H = 1000;
const PANEL_H = H - PHOTO_H;
const MARGIN = 64;
const CREAM = '#FAF5E9';
const BURGUNDY = '#5A1A1F';
const RUST = '#A14F2A';

export function wrap(title, size) {
  const maxChars = Math.floor((W - 2 * MARGIN) / (size * 0.46));
  const lines = [];
  let cur = '';
  for (const word of title.split(/\s+/)) {
    if (cur && (cur + ' ' + word).length > maxChars) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cur ? cur + ' ' + word : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function layout(title) {
  for (const size of [68, 60, 52, 46, 40]) {
    const lines = wrap(title, size);
    if (lines.length <= 5) return { size, lines };
  }
  return { size: 40, lines: wrap(title, 40).slice(0, 5) };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function panelSvg(title) {
  const { size, lines } = layout(title);
  const lead = Math.round(size * 1.18);
  const top = 84;
  const text = lines
    .map(
      (l, i) =>
        `<text x="${MARGIN}" y="${top + size + i * lead}" font-family="Cormorant Garamond" font-weight="600" font-size="${size}" fill="${BURGUNDY}">${esc(l)}</text>`,
    )
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PANEL_H}" viewBox="0 0 ${W} ${PANEL_H}">` +
      `<rect width="${W}" height="${PANEL_H}" fill="${CREAM}"/>` +
      `<rect x="${MARGIN}" y="40" width="72" height="6" fill="${RUST}"/>` +
      text +
      `<text x="${MARGIN}" y="${PANEL_H - 48}" font-family="Inter" font-weight="500" font-size="28" letter-spacing="3" fill="${RUST}">vinomartino.com</text>` +
      `</svg>`,
  );
}

export async function renderPin({ src, out, title }) {
  const photo = await sharp(src).rotate().resize(W, PHOTO_H, { fit: 'cover', position: 'centre' }).toBuffer();
  const panel = await sharp(panelSvg(title)).png().toBuffer();
  const stats = await sharp(panel).removeAlpha().stats();
  const spread = Math.max(...stats.channels.map((c) => c.stdev));
  if (spread < 8) throw new Error(`tekstvlak leeg (geen fonts?) voor ${out}`);
  const jpg = await sharp({ create: { width: W, height: H, channels: 3, background: CREAM } })
    .composite([
      { input: photo, top: 0, left: 0 },
      { input: panel, top: PHOTO_H, left: 0 },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  writeFileSync(out, jpg);
  return jpg.length;
}

if (process.argv[1] && process.argv[1].endsWith('pin-render.mjs') && process.argv[2]) {
  const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const sizes = {};
  for (const job of jobs) sizes[job.out] = await renderPin(job);
  writeFileSync(process.argv[2] + '.sizes.json', JSON.stringify(sizes));
}
