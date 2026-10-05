#!/usr/bin/env node
/**
 * Migration: add optional `route_id` (M2O -> routes) to `reispakketten` (LAT-12646).
 *
 * Een verhaal koppelt op route_id als dat gevuld is, anders op streek
 * (src/lib/reis-verhaal.ts). Zo kan het Champagne-verhaal (Reims/Epernay) aan de
 * Reims-route hangen en niet aan champagne-aube, ook al delen ze een streek.
 *
 * Run (schema-werk, dus --admin):
 *   /paperclip/scripts/directus-run-internal.sh --admin \
 *     --script directus/scripts/add-reispakket-route-field.mjs
 *
 * Idempotent: bestaand veld/relatie wordt overgeslagen.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_TOKEN is required.'); process.exit(1); }
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (res.ok) return { ok: true, text };
  if (res.status === 409 || /already exists|already has an associated relationship/i.test(text)) {
    return { ok: true, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

async function main() {
  const routes = await fetch(`${DIRECTUS_URL}/fields/routes/id`, { headers });
  const routesId = (await routes.json()).data;
  const type = routesId?.type || 'integer';
  console.log(`routes.id type: ${type}`);

  const field = await api('POST', '/fields/reispakketten', {
    field: 'route_id',
    type,
    meta: {
      interface: 'select-dropdown-m2o',
      width: 'half',
      note: 'Optioneel: toon dit verhaal op deze route (M2O -> routes). Leeg = op alle routes van dezelfde streek.',
      special: ['m2o'],
    },
    schema: { is_nullable: true },
  });
  if (!field.ok) { console.error(`field FAIL ${field.status}: ${field.text.slice(0, 300)}`); process.exit(1); }
  console.log(field.alreadyExists ? 'field exists' : 'field created');

  const rel = await api('POST', '/relations', {
    collection: 'reispakketten',
    field: 'route_id',
    related_collection: 'routes',
    schema: { on_delete: 'SET NULL' },
  });
  if (!rel.ok) { console.error(`relation FAIL ${rel.status}: ${rel.text.slice(0, 300)}`); process.exit(1); }
  console.log(rel.alreadyExists ? 'relation exists' : 'relation created');
}
main().catch((e) => { console.error(e); process.exit(1); });
