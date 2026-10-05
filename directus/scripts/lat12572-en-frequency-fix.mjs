#!/usr/bin/env node
// LAT-12572 — EN `ui_strings_translations` die nog "every two weeks" / "a few times a year" beloven.
// fetchUiStrings() overlayt Directus over UI_STRING_EN, dus de code-fix alleen is op EN onzichtbaar.
// Idempotent: draait opnieuw zonder wijziging. Usage: ... -- [--dry-run]

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

const STALE = /two weeks|few times a year/i;
const swap = (v) => v.replace(/Every two weeks/g, 'Once a month').replace(/every two weeks/g, 'once a month');
const FIXES = {
  'home.brief.dateline': () => 'The letter · once a month',
  'home.brief.heading': () => 'A letter once a month. No listicles.',
  'newsletter.footer.kicker': () => 'The letter · once a month',
  'newsletter.footer.lede': () => 'Once a month Marijn sends a real letter: about a winemaker we just visited, a region that caught our attention again, a bottle that made an impression.',
  'langhe.capture.a.body': swap,
  'langhe.capture.a.subCopy': swap,
  'langhe.capture.c.subCopy': swap,
};

const rows = (await api('/items/ui_strings?limit=-1&fields=id,key,translations.id,translations.languages_code,translations.value')).data;
let changed = 0;
for (const row of rows) {
  const fix = FIXES[row.key];
  const en = (row.translations ?? []).find((t) => t.languages_code === 'en');
  if (!en || !fix) continue;
  const next = fix(String(en.value ?? ''));
  if (next === en.value) { console.log(`= ${row.key} (al goed)`); continue; }
  console.log(`~ ${row.key}\n    voor: ${en.value}\n    na:   ${next}`);
  if (!dryRun) await api(`/items/ui_strings_translations/${en.id}`, { method: 'PATCH', body: JSON.stringify({ value: next }) });
  changed++;
}

const after = (await api('/items/ui_strings?limit=-1&fields=key,translations.languages_code,translations.value')).data;
const stale = after.filter((r) => (r.translations ?? []).some((t) => STALE.test(String(t.value ?? ''))));
const seenKeys = after.filter((r) => FIXES[r.key]).length;
console.log(`rows=${after.length} fixKeysFound=${seenKeys}/${Object.keys(FIXES).length} changed=${changed}${dryRun ? ' (dry-run)' : ''}`);
console.log(`stale-na (elke taal, "two weeks|few times a year"): ${stale.length}`);
for (const r of stale) console.log(`  ! ${r.key}`);
process.exit(dryRun || stale.length === 0 ? 0 : 1);
