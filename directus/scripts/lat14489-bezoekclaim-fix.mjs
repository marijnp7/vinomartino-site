#!/usr/bin/env node
// LAT-14489 — generieke bezoekclaim "een wijnmaker die we net bezochten" / "a winemaker we just visited"
// en de kop "Overnachten bij <huis>" uit `ui_strings_translations`. fetchUiStrings() overlayt Directus
// over de code, dus de code-fix alleen is op EN onzichtbaar. Idempotent. Usage: ... -- [--dry-run]

const URL_BASE = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN;
const dryRun = process.argv.includes('--dry-run');
if (!TOKEN) { console.error('DIRECTUS_TOKEN is required.'); process.exit(1); }

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
async function api(path, init = {}) {
  const res = await fetch(`${URL_BASE}${path}`, { ...init, headers, redirect: 'manual' });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const STALE = /net bezochten|just visited|^Overnachten bij$/i;
const swap = (v) => v
  .replace(/over een wijnmaker die we net bezochten/g, 'over een wijnhuis dat we uitlichten')
  .replace(/Over een wijnmaker die we net bezochten/g, 'Over een wijnhuis dat we uitlichten')
  .replace(/about a winemaker we just visited/g, 'about a winery we are featuring')
  .replace(/About a winemaker we just visited/g, 'About a winery we are featuring')
  .replace(/^Overnachten bij$/, 'Overnachten in de buurt van');

const rows = (await api('/items/ui_strings?limit=-1&fields=id,key,translations.id,translations.languages_code,translations.value')).data;
let changed = 0;
for (const row of rows) {
  for (const t of row.translations ?? []) {
    const cur = String(t.value ?? '');
    if (!STALE.test(cur)) continue;
    const next = swap(cur);
    if (next === cur) { console.log(`! ${row.key} [${t.languages_code}] niet automatisch te herstellen: ${cur}`); continue; }
    console.log(`~ ${row.key} [${t.languages_code}]\n    voor: ${cur}\n    na:   ${next}`);
    if (!dryRun) await api(`/items/ui_strings_translations/${t.id}`, { method: 'PATCH', body: JSON.stringify({ value: next }) });
    changed++;
  }
}

const after = (await api('/items/ui_strings?limit=-1&fields=key,translations.languages_code,translations.value')).data;
const stale = after.flatMap((r) => (r.translations ?? []).filter((t) => STALE.test(String(t.value ?? ''))).map((t) => `${r.key} [${t.languages_code}]`));
console.log(`rows=${after.length} changed=${changed}${dryRun ? ' (dry-run)' : ''} stale-na=${stale.length}`);
for (const s of stale) console.log(`  ! ${s}`);
process.exit(dryRun || stale.length === 0 ? 0 : 1);
