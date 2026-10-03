// scripts/lat2772-newsletter-cta-attribution.test.mjs — LAT-2772, herschreven in LAT-12309
//
// MailerLite is losgekoppeld (LAT-12309): elke "De brief"-CTA is nu een
// <SubstackCta>-link. De klik-attributie loopt via `data-cta-id` op een
// `a[href]` (site-events.ts: cta_click). Twee dingen mogen niet stuklopen:
//   1. elke <SubstackCta> draagt een ctaId (anders is de klik niet te herleiden)
//   2. er staat geen MailerLite-endpoint of -env-var meer in de broncode

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...files(full, ext));
    else if (ext.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

test('elke <SubstackCta> draagt placement en ctaId', () => {
  let seen = 0;
  const offenders = [];
  for (const file of files(path.join(root, 'src'), ['.astro'])) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/<SubstackCta\b[^>]*\/>/g)) {
      seen += 1;
      if (!/\bplacement=/.test(m[0]) || !/\bctaId=/.test(m[0])) {
        offenders.push(`${path.relative(root, file)}: ${m[0]}`);
      }
    }
  }
  assert.ok(seen >= 6, `verwachtte >= 6 SubstackCta-plekken, vond ${seen}`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('de Substack-link draagt UTM en wijst naar substack', () => {
  const social = readFileSync(path.join(root, 'src/lib/social.ts'), 'utf8');
  assert.match(social, /export function substackSubscribeUrl/);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    assert.match(social, new RegExp(`searchParams\\.set\\('${k}'`), `${k} ontbreekt`);
  }
  assert.match(social, /vinomartino\.substack\.com/);
});

test('geen MailerLite-endpoint of env-var meer in src/', () => {
  const offenders = [];
  for (const file of files(path.join(root, 'src'), ['.astro', '.ts'])) {
    const source = readFileSync(file, 'utf8');
    if (/assets\.mailerlite\.com|PUBLIC_MAILERLITE|data-newsletter-signup|fields\[email\]/.test(source)) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, [], `MailerLite-resten:\n${offenders.join('\n')}`);
});
