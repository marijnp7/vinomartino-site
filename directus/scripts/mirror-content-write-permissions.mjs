#!/usr/bin/env node
/**
 * Mirror content write-permissions onto the accommodations collection (LAT-1328).
 *
 * Symptom: the content token returns 403 FORBIDDEN when writing `booking_url`
 * (and other fields) on the `accommodations` collection, while it writes
 * `articles` fine. That asymmetry is pure Directus permissions: `articles`
 * got create/update for the content role/policy, `accommodations` (newer
 * collection, imported under LAT-1136) never did. Same class of bug as the
 * read-permission asymmetry fixed in LAT-897 / mirror-articles-read-permissions.mjs.
 *
 * This copies every non-system permission row of the requested ACTIONS that
 * exists on the SOURCE collection onto the TARGET collection, skipping rows
 * that already match (role, policy, collection, action).
 *
 * Usage (from VPS, with admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a    # for DIRECTUS_URL
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/mirror-content-write-permissions.mjs
 *
 * Tunables (env):
 *   SOURCE   default "articles"        — collection the content role can already write
 *   TARGET   default "accommodations"  — collection to grant the same access on
 *   ACTIONS  default "create,update,read"
 *
 * Pass `--dry-run` to print what would be created without writing.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

const SOURCE = process.env.SOURCE || 'articles';
const TARGET = process.env.TARGET || 'accommodations';
const ACTIONS = (process.env.ACTIONS || 'create,update,read')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (must be an admin token).');
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

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
  // Permissions identity: (role, policy, collection, action).
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
  console.log(`Mirroring ${ACTIONS.join('+')} permissions: ${SOURCE} → ${TARGET}`);

  const filter = encodeURIComponent(JSON.stringify({
    collection: { _in: [SOURCE, TARGET] },
  }));
  const list = await api('GET', `/permissions?limit=-1&filter=${filter}`);
  const perms = (list && list.data) || [];

  const sourceRows = perms.filter(p => p.collection === SOURCE && ACTIONS.includes(p.action));
  if (sourceRows.length === 0) {
    console.error(`No ${ACTIONS.join('/')} permissions found on ${SOURCE}. Nothing to mirror — check the source collection.`);
    process.exit(2);
  }

  console.log(`Found ${sourceRows.length} permission row(s) on ${SOURCE}:`);
  for (const p of sourceRows) {
    console.log(`  • action=${p.action} role=${p.role ?? '(public)'} policy=${p.policy ?? '-'} fields=${JSON.stringify(p.fields)} permissions=${JSON.stringify(p.permissions)}`);
  }

  const existingTargets = new Set(perms.filter(p => p.collection === TARGET).map(permKey));

  let created = 0;
  let skipped = 0;
  for (const src of sourceRows) {
    const candidate = buildCopy(src, TARGET);
    if (existingTargets.has(permKey(candidate))) {
      console.log(`  ↳ ${TARGET}: already has ${candidate.action} for role=${candidate.role ?? '(public)'} policy=${candidate.policy ?? '-'} — skipping`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  ↳ ${TARGET}: WOULD create ${JSON.stringify(candidate)}`);
      created++;
      continue;
    }
    await api('POST', '/permissions', candidate);
    console.log(`  ✓ ${TARGET}: created ${candidate.action} for role=${candidate.role ?? '(public)'} policy=${candidate.policy ?? '-'}`);
    created++;
  }

  console.log(`\nDone — created: ${created}, skipped: ${skipped}${DRY_RUN ? ' (dry-run)' : ''}`);
  if (!DRY_RUN) {
    console.log(`\nVerify with a test write, e.g.:`);
    console.log(`  curl -s -X PATCH "$DIRECTUS_URL/items/${TARGET}/<id>" \\`);
    console.log(`    -H "Authorization: Bearer <content-token>" -H 'Content-Type: application/json' \\`);
    console.log(`    -d '{"booking_url":"https://example.test"}'`);
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
