#!/usr/bin/env node
/**
 * Mirror articles read-permissions onto streken/wijnhuizen/routes (LAT-897).
 *
 * Symptom: build-time Directus token returns 403 FORBIDDEN at the collection
 * level on streken/wijnhuizen/routes, while the same token reads articles
 * fine. That asymmetry is pure Directus permissions — articles got read for
 * the build token's role/policy, the other 3 collections never did.
 *
 * This script copies every `read` permission row that exists on `articles`
 * onto streken, wijnhuizen, and routes (skipping rows that already match).
 *
 * Usage (from VPS, with admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a    # for DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/mirror-articles-read-permissions.mjs
 *
 * Pass `--dry-run` to print what would be created without writing.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (must be an admin token).');
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };
const SOURCE = 'articles';
const TARGETS = ['landen', 'streken', 'wijnhuizen', 'routes'];

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: AUTH,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function permKey(p) {
  // Permissions identity: (role, policy, collection, action). Permissions
  // for the public role have role=null in v9; v10+ may use policy instead.
  return JSON.stringify({ role: p.role ?? null, policy: p.policy ?? null, collection: p.collection, action: p.action });
}

function buildCopy(srcPerm, targetCollection) {
  const copy = { ...srcPerm, collection: targetCollection };
  delete copy.id;
  // `system: true` rows belong to Directus itself — never duplicate them.
  delete copy.system;
  return copy;
}

async function main() {
  const filter = encodeURIComponent(JSON.stringify({
    collection: { _in: [SOURCE, ...TARGETS] },
  }));
  const list = await api('GET', `/permissions?limit=-1&filter=${filter}`);
  const perms = (list && list.data) || [];

  const sourceReads = perms.filter(p => p.collection === SOURCE && p.action === 'read');
  if (sourceReads.length === 0) {
    console.error(`No read permissions found on ${SOURCE}. Nothing to mirror — articles must be misconfigured too.`);
    process.exit(2);
  }

  console.log(`Found ${sourceReads.length} read permission row(s) on ${SOURCE}:`);
  for (const p of sourceReads) {
    console.log(`  • role=${p.role ?? '(public)'} policy=${p.policy ?? '-'} fields=${JSON.stringify(p.fields)} permissions=${JSON.stringify(p.permissions)}`);
  }

  const existingTargets = new Set(perms.filter(p => TARGETS.includes(p.collection)).map(permKey));

  let created = 0;
  let skipped = 0;
  for (const target of TARGETS) {
    for (const src of sourceReads) {
      const candidate = buildCopy(src, target);
      if (existingTargets.has(permKey(candidate))) {
        console.log(`  ↳ ${target}: already has read for role=${candidate.role ?? '(public)'} policy=${candidate.policy ?? '-'} — skipping`);
        skipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  ↳ ${target}: WOULD create ${JSON.stringify(candidate)}`);
        created++;
        continue;
      }
      await api('POST', '/permissions', candidate);
      console.log(`  ✓ ${target}: created read for role=${candidate.role ?? '(public)'} policy=${candidate.policy ?? '-'}`);
      created++;
    }
  }

  console.log(`\nDone — created: ${created}, skipped: ${skipped}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
