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
 *    same items always get the same dates (idempotent, no re-shuffle). Items that
 *    already sit OUTSIDE the same-day cluster are treated as already-spread and
 *    are left untouched.
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
 *   --all       also re-date items already outside the cluster (rarely needed)
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
  // Ask for date_created; if the collection has no accountability field Directus
  // returns null for it and we fall back to id ordering.
  const fields = 'id,slug,pub_date,date_created';
  const r = await api(
    'GET',
    `/items/${collection}?fields=${fields}&limit=-1&sort=id`,
  );
  if (!r.ok) {
    throw new Error(`fetch ${collection}: ${r.status} ${r.text}`);
  }
  return r.json.data || [];
}

// The "cluster" = the pub_date value shared by the most items (plus nulls). Items
// on the cluster date or null are candidates to backdate; everything else is
// treated as already-spread and left alone (unless --all).
function pickCandidates(items) {
  const counts = new Map();
  for (const it of items) {
    const key = it.pub_date == null ? '__null__' : String(it.pub_date).slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let clusterKey = null;
  let clusterN = 0;
  for (const [k, n] of counts) {
    if (n > clusterN) {
      clusterN = n;
      clusterKey = k;
    }
  }
  const isCandidate = (it) => {
    if (REDATE_ALL) return true;
    if (it.pub_date == null) return true;
    return String(it.pub_date).slice(0, 10) === clusterKey;
  };
  return { clusterKey, clusterN, isCandidate };
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

  // 1. Gather candidates across all dated collections, tagged + globally ordered.
  const all = [];
  const fieldTypes = {};
  for (const { collection, field } of COLLECTIONS) {
    fieldTypes[collection] = (await fieldType(collection, field)) || 'date';
    const items = await fetchItems(collection);
    const { clusterKey, clusterN, isCandidate } = pickCandidates(items);
    console.log(
      `[${collection}] ${items.length} items — cluster "${clusterKey}" x${clusterN}`,
    );
    for (const it of items) {
      if (!isCandidate(it)) continue;
      all.push({
        collection,
        field,
        id: it.id,
        slug: it.slug || String(it.id),
        // sort key: date_created if present else id (numeric-aware)
        createdKey: it.date_created ? Date.parse(it.date_created) : Number(it.id) || 0,
        idNum: Number(it.id) || 0,
      });
    }
  }
  all.sort((a, b) => a.createdKey - b.createdKey || a.idNum - b.idNum);

  if (all.length === 0) {
    console.log('\nNo candidates to backdate. Nothing to do.');
    return;
  }
  if (all.length > weekdays.length) {
    console.error(
      `\nToo many candidates (${all.length}) for available weekdays (${weekdays.length}). Widen the window.`,
    );
    process.exit(1);
  }

  // 2. Deterministic irregular schedule: walk weekday indices with a jittered gap
  //    around the base spacing so weeks vary (some quiet, some with two). One item
  //    per weekday keeps "same collection twice a day" and "max 2/day" satisfied.
  const base = weekdays.length / all.length; // avg weekdays between publications
  let idx = rng() * base; // random offset into the first slot
  const dayUsage = new Map(); // dayIso -> count, enforces global max 2/day

  const results = [];
  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    const mapKey = `${item.collection}:${item.slug}`;

    let assignedDate;
    let assignedTime;

    if (persistedMap[mapKey] && !REDATE_ALL) {
      // Idempotent: reuse the previously committed assignment verbatim.
      assignedDate = persistedMap[mapKey].date;
      assignedTime = persistedMap[mapKey].time;
    } else {
      // Reserve remaining slots so later items still fit before WINDOW_END.
      const remaining = all.length - i - 1;
      const maxIdx = weekdays.length - remaining - 1;
      let slot = Math.min(Math.floor(idx), maxIdx);
      // ensure strictly increasing (distinct weekday per item)
      let dayIso = isoDate(weekdays[slot]);
      // never exceed 2 items on a day overall
      while ((dayUsage.get(dayIso) || 0) >= 2 && slot < maxIdx) {
        slot += 1;
        dayIso = isoDate(weekdays[slot]);
      }
      assignedDate = dayIso;
      assignedTime = pickTime(rng);
      dayUsage.set(dayIso, (dayUsage.get(dayIso) || 0) + 1);

      // advance idx by a jittered gap: mostly ~base, sometimes small (busy),
      // sometimes a long quiet stretch.
      const r = rng();
      let factor;
      if (r < 0.15) factor = 0.25 + rng() * 0.4; // busy: back-to-back-ish
      else if (r > 0.85) factor = 1.8 + rng() * 1.6; // quiet week(s)
      else factor = 0.7 + rng() * 0.9; // normal spread
      idx = slot + Math.max(1, base * factor);

      persistedMap[mapKey] = { date: assignedDate, time: assignedTime };
    }

    const useTime = fieldTypes[item.collection] !== 'date';
    const value = useTime ? `${assignedDate}T${assignedTime}` : assignedDate;
    results.push({ ...item, mapKey, date: assignedDate, time: assignedTime, value, useTime });
  }

  // 3. Print the table (dry-run always; apply prints too).
  console.log(`\n${all.length} item(s) to (re)date:\n`);
  console.log('  collection    date        time      slug');
  console.log('  ' + '-'.repeat(70));
  for (const r of results) {
    console.log(
      `  ${r.collection.padEnd(12)}  ${r.date}  ${r.time}  ${r.slug}`,
    );
  }

  // Self-check: no weekend, all in window, no collection twice/day, max 2/day.
  const perDayCollection = new Map();
  const perDay = new Map();
  let violations = 0;
  for (const r of results) {
    const dow = new Date(r.date + 'T00:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) {
      console.error(`  ! weekend date ${r.date} (${r.slug})`);
      violations++;
    }
    if (r.date < WINDOW_START || r.date > WINDOW_END) {
      console.error(`  ! out-of-window ${r.date} (${r.slug})`);
      violations++;
    }
    const ck = `${r.collection}|${r.date}`;
    perDayCollection.set(ck, (perDayCollection.get(ck) || 0) + 1);
    perDay.set(r.date, (perDay.get(r.date) || 0) + 1);
  }
  for (const [k, n] of perDayCollection) if (n > 1) { console.error(`  ! ${k} has ${n} items (same collection/day)`); violations++; }
  for (const [k, n] of perDay) if (n > 2) { console.error(`  ! ${k} has ${n} items (>2/day)`); violations++; }
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
