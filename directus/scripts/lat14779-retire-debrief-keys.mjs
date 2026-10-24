#!/usr/bin/env node
// LAT-14779: verwijder de vervallen /de-brief/-keys (debrief.editie.*, debrief.edities.*,
// debrief.follow.*) uit Directus ui_strings, zodat de editielijst niet terugkomt.
// Gebruik: directus-run-internal.sh --script directus/scripts/lat14779-retire-debrief-keys.mjs [-- --dry-run]
const URL_ = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/+$/, '');
const headers = { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };
const dryRun = process.argv.includes('--dry-run');
const RETIRED = /^debrief\.(editie|edities|follow)\./;

async function api(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const { data } = await api('/items/ui_strings?limit=-1&filter[key][_starts_with]=debrief.&fields=id,key,translations.id');
const rows = data.filter((r) => RETIRED.test(r.key));
console.log(`[retire] ${rows.length} vervallen keys: ${rows.map((r) => r.key).join(', ')}${dryRun ? ' (dry-run)' : ''}`);
if (!dryRun && rows.length) {
  const trIds = rows.flatMap((r) => (r.translations || []).map((t) => t.id ?? t));
  if (trIds.length) await api('/items/ui_strings_translations', { method: 'DELETE', body: JSON.stringify(trIds) });
  await api('/items/ui_strings', { method: 'DELETE', body: JSON.stringify(rows.map((r) => r.id)) });
  const after = await api('/items/ui_strings?limit=-1&filter[key][_starts_with]=debrief.&fields=key');
  const left = after.data.filter((r) => RETIRED.test(r.key));
  console.log(`[retire] verwijderd: ${rows.length} keys, ${trIds.length} vertalingen; resterend vervallen: ${left.length}`);
  if (left.length) process.exit(1);
}
