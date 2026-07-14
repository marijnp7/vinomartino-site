#!/usr/bin/env node
/**
 * LAT-2358 — Backdate publication dates (organically spread over 6 months) and
 * make the result reproducible/idempotent.
 *
 * WHY: content in Directus shares (nearly) one pub_date and every rebuild pushes
 * null-pub_date articles onto "today" (see src/lib/articles.ts fallback), so the
 * site looks machine-generated. This assigns each item a credible, spread-out
 * publication date within the last 6 months. Chronology is preserved (oldest
 * created item gets the oldest date).
 *
 * SCOPE: only collections that actually have a publication-date field are
 * touched. Per the diagnosis on LAT-2358 that is ONLY `articles`; landen /
 * streken / wijnhuizen / routes / accommodations have no date field and are not
 * date-sorted, so there is nothing to backdate there. If a live collection turns
 * out to have a date field, add it to COLLECTIONS below.
 *
 * RULES (from the ticket):
 *  - Window: 2026-01-13 .. 2026-07-12 (6 months back, up to yesterday).
 *  - Order by date_created asc (fallback: numeric id asc); oldest -> oldest date.
 *  - Weekdays only (Mon-Fri).
 *  - Never two items of the same collection on one day; max 2 items/day overall.
 *  - Avg ~1-3 publications/week with natural irregularity (quiet + busy weeks).
 *  - Time-of-day 08:12..20:47, minutes never :00 (only stored if the field is a
 *    datetime/timestamp type; a Directus `date` field keeps the date only).
 *  - Deterministic: fixed SEED, and the computed mapping is persisted to
 *    directus/data/backdate-pub-dates.map.json. Re-runs reuse that map, so the
 *    same items always get the same dates (idempotent, no re-shuffle).
 *
 * WHICH ITEMS GET (RE)DATED: an item is a candidate when its current pub_date
 * still looks machine-generated — null, on a weekend, or sharing its day with
 * another (non-locked) item (a same-day cluster). Items already committed to the
 * map are locked (their date is final and only occupies a calendar slot); items
 * with a clean, unique weekday date are kept as-is. This makes the second pass
 * (re-spreading weekend/cluster dates from an earlier import) fall out naturally:
 * run it again and only the still-bad dates move, protected by the map.
 *
 * RUN (from VPS, admin token):
 *   set -a && source /root/vinomartino-site/.env && set +a
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/backdate-pub-dates.mjs --dry-run
 *   # review the printed slug -> date table, paste it on LAT-2358, THEN:
 *   DIRECTUS_TOKEN=<admin-token> node directus/scripts/backdate-pub-dates.mjs --apply
 *
 * Flags:
 *   --dry-run   compute + print the table, write nothing (default if neither given)
 *   --apply     PATCH pub_date on the items and persist the map file
 *   --all       re-date every non-locked item, even clean ones (rarely needed)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dirname, '..', 'data', 'backdate-pub-dates.map.json');

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const DRY_RUN = !APPLY || args.has('--dry-run');
const REDATE_ALL = args.has('--all');

// Fixed seed — do NOT change once applied, or dates will move on the next run.
const SEED = 20260713;

const WINDOW_START = '2026-01-13';
const WINDOW_END = '2026-07-12';

// Collections with a publication-date field. field = the date column to write.
const COLLECTIONS = [{ collection: 'articles', field: 'pub_date' }];

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (must be an admin token).');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

// ── deterministic PRNG (mulberry32) ──────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── date helpers (UTC, no tz drift) ──────────────────────────────────────────
function dayMs(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function weekdaysInWindow(startIso, endIso) {
  const out = [];
  let t = Date.parse(startIso + 'T00:00:00Z');
  const end = Date.parse(endIso + 'T00:00:00Z');
  while (t <= end) {
    const dow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
    if (dow !== 0 && dow !== 6) out.push(t);
    t += 24 * 60 * 60 * 1000;
  }
  return out;
}

// Pick a time-of-day inside 08:12..20:47, minute != 00. Returns "HH:MM:SS".
function pickTime(rng) {
  const hour = 8 + Math.floor(rng() * 13); // 8..20
  let minute = 1 + Math.floor(rng() * 59); // 1..59, never 00
  if (hour === 8 && minute < 12) minute = 12 + Math.floor(rng() * 20);
  if (hour === 20 && minute > 47) minute = 13 + Math.floor(rng() * 34);
  const second = Math.floor(rng() * 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

async function fieldType(collection, field) {
  const r = await api('GET', `/fields/${collection}/${field}`);
  if (!r.ok || !r.json?.data) return null;
  return r.json.data.type; // 'date' | 'timestamp' | 'dateTime' | ...
}

async function fetchItems(collection) {
  // Prefer date_created for chronology, but Directus 403s the WHOLE query when a
  // requested field does not exist on the collection (it does NOT return null).
  // `articles` has no accountability date_created, so retry without it and fall
  // back to id ordering (createdKey below already handles a missing date_created).
  const base = `/items/${collection}?limit=-1&sort=id&fields=`;
  let r = await api('GET', `${base}id,slug,pub_date,date_created`);
  if (!r.ok) {
    r = await api('GET', `${base}id,slug,pub_date`);
  }
  if (!r.ok) {
    throw new Error(`fetch ${collection}: ${r.status} ${r.text}`);
  }
  return r.json.data || [];
}

function isWeekendIso(iso) {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

// Classify a collection's items into three buckets:
//  - locked : already assigned by a previous run (present in the committed map).
//             Their dates are final (map-protected) and only OCCUPY a day-slot.
//  - candidate : a non-locked item whose current pub_date still looks
//             machine-generated — null, on a weekend, or sharing its day with
//             another non-locked item (a same-day cluster). These get re-dated.
//  - kept : a non-locked item that already has a clean, unique weekday date.
//             Left untouched; only OCCUPIES its current day-slot.
// --all forces every non-locked item into `candidate`.
function classifyItems(items, collection, persistedMap) {
  const keyOf = (it) => `${collection}:${it.slug || it.id}`;
  const nonLocked = items.filter((it) => !persistedMap[keyOf(it)]);
  const dayCounts = new Map();
  for (const it of nonLocked) {
    if (it.pub_date) {
      const d = String(it.pub_date).slice(0, 10);
      dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
    }
  }
  const locked = [];
  const candidates = [];
  const kept = [];
  for (const it of items) {
    if (persistedMap[keyOf(it)]) {
      locked.push(it);
      continue;
    }
    const d = it.pub_date ? String(it.pub_date).slice(0, 10) : null;
    const bad =
      REDATE_ALL || d === null || isWeekendIso(d) || (dayCounts.get(d) || 0) > 1;
    if (bad) candidates.push(it);
    else kept.push(it);
  }
  return { locked, candidates, kept, keyOf };
}

function loadMap() {
  if (!existsSync(MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveMap(map) {
  mkdirSync(dirname(MAP_PATH), { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
}

async function run() {
  console.log(`\nLAT-2358 backdate pub-dates ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'}`);
  console.log(`Target: ${DIRECTUS_URL}`);
  console.log(`Window: ${WINDOW_START} .. ${WINDOW_END} (weekdays only)\n`);

  const weekdays = weekdaysInWindow(WINDOW_START, WINDOW_END);
  const persistedMap = loadMap();
  const rng = mulberry32(SEED);

  // Occupancy of the calendar by items we are NOT re-dating this run: map-locked
  // items (their committed date) and clean "kept" items (their current date).
  // Candidates may only land on days that stay within <=1/collection/day and
  // <=2/day AFTER counting this occupancy.
  const occCollectionDay = new Set(); // `${collection}|${day}`
  const occDay = new Map(); // day -> total count across collections
  const occupy = (collection, day) => {
    occCollectionDay.add(`${collection}|${day}`);
    occDay.set(day, (occDay.get(day) || 0) + 1);
  };

  // 1. Classify every collection; gather candidates + pre-seed occupancy.
  const perCollectionCandidates = new Map();
  const fieldTypes = {};
  for (const { collection, field } of COLLECTIONS) {
    fieldTypes[collection] = (await fieldType(collection, field)) || 'date';
    const items = await fetchItems(collection);
    const { locked, candidates, kept, keyOf } = classifyItems(items, collection, persistedMap);
    console.log(
      `[${collection}] ${items.length} items — ${locked.length} locked, ${candidates.length} candidate, ${kept.length} kept`,
    );
    for (const it of locked) occupy(collection, persistedMap[keyOf(it)].date);
    for (const it of kept) occupy(collection, String(it.pub_date).slice(0, 10));
    perCollectionCandidates.set(
      collection,
      candidates
        .map((it) => ({
          collection,
          field,
          id: it.id,
          slug: it.slug || String(it.id),
          mapKey: keyOf(it),
          createdKey: it.date_created ? Date.parse(it.date_created) : Number(it.id) || 0,
          idNum: Number(it.id) || 0,
        }))
        .sort((a, b) => a.createdKey - b.createdKey || a.idNum - b.idNum),
    );
  }

  const totalCandidates = [...perCollectionCandidates.values()].reduce((n, c) => n + c.length, 0);
  if (totalCandidates === 0) {
    console.log('\nNo candidates to (re)date. Nothing to do.');
    return;
  }

  // 2. Per collection, distribute candidates over the weekdays that are still free
  //    for that collection (<=1/collection/day) and globally under the 2/day cap.
  //    We walk the free-day list with a jittered gap so weeks vary (quiet + busy).
  const results = [];
  for (const { collection } of COLLECTIONS) {
    const cands = perCollectionCandidates.get(collection);
    if (!cands.length) continue;
    const freeDays = weekdays.filter((ms) => {
      const day = isoDate(ms);
      return !occCollectionDay.has(`${collection}|${day}`) && (occDay.get(day) || 0) < 2;
    });
    if (cands.length > freeDays.length) {
      console.error(
        `\n[${collection}] ${cands.length} candidates but only ${freeDays.length} free weekdays. Widen the window.`,
      );
      process.exit(1);
    }
    const useTime = fieldTypes[collection] !== 'date';
    const base = freeDays.length / cands.length;
    let idx = rng() * base;
    for (let i = 0; i < cands.length; i++) {
      const remaining = cands.length - i - 1;
      const maxIdx = freeDays.length - remaining - 1;
      const slot = Math.min(Math.floor(idx), maxIdx);
      const day = isoDate(freeDays[slot]);
      const time = pickTime(rng);
      occupy(collection, day); // keep the running cap honest
      persistedMap[cands[i].mapKey] = { date: day, time };
      const value = useTime ? `${day}T${time}` : day;
      results.push({ ...cands[i], date: day, time, value, useTime });

      const r = rng();
      let factor;
      if (r < 0.15) factor = 0.25 + rng() * 0.4; // busy: back-to-back-ish
      else if (r > 0.85) factor = 1.8 + rng() * 1.6; // quiet week(s)
      else factor = 0.7 + rng() * 0.9; // normal spread
      idx = slot + Math.max(1, base * factor);
    }
  }

  // 3. Print the table (dry-run always; apply prints too).
  results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`\n${results.length} item(s) to (re)date:\n`);
  console.log('  collection    date        time      slug');
  console.log('  ' + '-'.repeat(70));
  for (const r of results) {
    console.log(`  ${r.collection.padEnd(12)}  ${r.date}  ${r.time}  ${r.slug}`);
  }

  // Self-check across the FULL final calendar (locked + kept + newly dated).
  let violations = 0;
  for (const r of results) {
    if (isWeekendIso(r.date)) {
      console.error(`  ! weekend date ${r.date} (${r.slug})`);
      violations++;
    }
    if (r.date < WINDOW_START || r.date > WINDOW_END) {
      console.error(`  ! out-of-window ${r.date} (${r.slug})`);
      violations++;
    }
  }
  for (const [k, n] of occDay) if (n > 2) { console.error(`  ! ${k} has ${n} items (>2/day)`); violations++; }
  // occCollectionDay is a Set, so a re-add is a no-op; recount per collection/day.
  const colDayCount = new Map();
  for (const r of results) {
    const ck = `${r.collection}|${r.date}`;
    colDayCount.set(ck, (colDayCount.get(ck) || 0) + 1);
  }
  for (const [k, n] of colDayCount) if (n > 1) { console.error(`  ! ${k} has ${n} newly-dated items (same collection/day)`); violations++; }
  if (violations > 0) {
    console.error(`\n${violations} constraint violation(s) — aborting.`);
    process.exit(1);
  }
  console.log('\n  constraints OK (weekday-only, in-window, <=1/collection/day, <=2/day)');

  if (DRY_RUN) {
    console.log('\nDRY-RUN: nothing written. Re-run with --apply to persist + PATCH.');
    return;
  }

  // 4. Apply: persist map first (source of truth for idempotency), then PATCH.
  saveMap(persistedMap);
  console.log(`\nWrote map -> ${MAP_PATH}`);

  let ok = 0;
  let failed = 0;
  for (const r of results) {
    const res = await api('PATCH', `/items/${r.collection}/${r.id}`, { [r.field]: r.value });
    if (res.ok) {
      ok++;
    } else {
      failed++;
      console.error(`  ✗ ${r.collection}/${r.slug}: ${res.status} ${res.text}`);
    }
  }
  console.log(`\nPATCHed ${ok} item(s), ${failed} failure(s).`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
