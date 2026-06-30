#!/usr/bin/env node
/**
 * Daily CJ (Commission Junction) Commission Detail import (LAT-1789, Phase 3 of LAT-1780).
 *
 * Fetches commissions for our publisher via the CJ GraphQL Commission Detail API
 * (https://commissions.api.cj.com/query, query `publisherCommissions`) and upserts
 * them into the Directus `affiliate_commissions` collection, keyed on `click_id`
 * (= the CJ `sid` we pass as `clkid` in the Booking.com affiliate label).
 *
 * Gating: the live CJ fetch is gated on env CJ_API_TOKEN. If the token is absent we
 * SKIP and log "token pending" and exit 0 — we never fail the job on a missing token
 * (per LAT-1789 werkverdeling). Marijn sets CJ_API_TOKEN as a sealed env var on the
 * DevOps agent.
 *
 * Runtime: devops-workspace (reaches both commissions.api.cj.com and directus:8055,
 * node v20). Run with an admin LOGIN Directus token.
 *
 *   CJ_API_TOKEN=<sealed> DIRECTUS_URL=http://directus:8055 DIRECTUS_TOKEN=<admin> \
 *     node directus/scripts/import-cj-commissions.mjs [--days N] [--dry-run]
 *
 * Idempotent: upsert on click_id, so re-runs over an overlapping window are safe.
 */

const CJ_ENDPOINT = "https://commissions.api.cj.com/query";
const CJ_PUBLISHER_ID = process.env.CJ_PUBLISHER_ID || "7938753";
const CJ_WEBSITE_ID = process.env.CJ_WEBSITE_ID || "101734849"; // attribution ref; query is per publisher
const COLLECTION = "affiliate_commissions";
const PAGE_GUARD = 50; // hard cap on paging loops (10k commissions/page)

const CJ_API_TOKEN = (process.env.CJ_API_TOKEN || "").trim();
const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://directus:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const daysArg = argv.indexOf("--days");
const LOOKBACK_DAYS = daysArg >= 0 ? Math.max(1, Math.min(31, Number(argv[daysArg + 1]) || 7)) : 7;

function log(...a) { console.log("[cj-import]", ...a); }

// --- Token gate: skip cleanly when the sealed token is not yet present. ---
if (!CJ_API_TOKEN) {
  log("CJ_API_TOKEN ontbreekt — token pending. Skip live fetch, exit 0 (geen fout).");
  process.exit(0);
}
if (!DIRECTUS_TOKEN && !DRY_RUN) {
  console.error("[cj-import] DIRECTUS_TOKEN is required (admin LOGIN token).");
  process.exit(1);
}

const dHeaders = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildQuery(sinceCommissionId) {
  const since = isoDaysAgo(LOOKBACK_DAYS);
  const before = isoNow();
  const sinceArg = sinceCommissionId ? `, sinceCommissionId: "${sinceCommissionId}"` : "";
  return `{
    publisherCommissions(forPublishers: ["${CJ_PUBLISHER_ID}"], sincePostingDate: "${since}", beforePostingDate: "${before}"${sinceArg}) {
      count
      maxCommissionId
      payloadComplete
      records {
        commissionId
        sid
        advertiserName
        actionStatus
        country
        websiteName
        clickDate
        eventDate
        postingDate
        saleAmountUsd
        pubCommissionAmountUsd
        pubCommissionAmountPubCurrency
      }
    }
  }`;
}

async function cjFetch(sinceCommissionId) {
  const res = await fetch(CJ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CJ_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: buildQuery(sinceCommissionId) }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CJ API HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`CJ API non-JSON response: ${text.slice(0, 300)}`); }
  if (json.errors) {
    throw new Error(`CJ GraphQL errors: ${JSON.stringify(json.errors).slice(0, 500)}`);
  }
  const pc = json?.data?.publisherCommissions;
  if (!pc) throw new Error(`CJ response missing publisherCommissions: ${text.slice(0, 300)}`);
  return pc;
}

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// sid -> placement (type token) + region (rest). E.g. "accommodation-locanda-del-pilone"
// -> placement "accommodation", region "locanda del pilone".
function parseSid(sid) {
  if (!sid) return { placement: "", region: "" };
  const m = String(sid).match(/^([a-z]+)-(.+)$/i);
  if (!m) return { placement: "", region: sid };
  return { placement: m[1].toLowerCase(), region: m[2].replace(/-/g, " ") };
}

function toRow(rec) {
  const sid = (rec.sid || "").trim();
  const clickId = sid || `cj-${rec.commissionId}`;
  const { placement, region } = parseSid(sid);
  return {
    click_id: clickId,
    commission_id: rec.commissionId != null ? String(rec.commissionId) : null,
    partner: rec.advertiserName || "",
    region,
    placement,
    commission_usd: num(rec.pubCommissionAmountUsd),
    commission_eur: num(rec.pubCommissionAmountPubCurrency),
    sale_amount_usd: num(rec.saleAmountUsd),
    action_status: rec.actionStatus || "",
    country: rec.country || "",
    event_date: rec.eventDate || rec.clickDate || null,
    posting_date: rec.postingDate || null,
    imported_at: isoNow(),
  };
}

async function fetchAllCommissions() {
  const out = [];
  let cursor = null;
  for (let page = 0; page < PAGE_GUARD; page++) {
    const pc = await cjFetch(cursor);
    const records = pc.records || [];
    out.push(...records);
    log(`pagina ${page + 1}: ${records.length} records (count=${pc.count}, payloadComplete=${pc.payloadComplete})`);
    if (pc.payloadComplete || records.length === 0 || !pc.maxCommissionId) break;
    cursor = pc.maxCommissionId;
  }
  return out;
}

async function existingClickIds() {
  const ids = new Set();
  const res = await fetch(`${DIRECTUS_URL}/items/${COLLECTION}?limit=-1&fields=click_id`, { headers: dHeaders });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      throw new Error(`${COLLECTION} niet leesbaar (HTTP ${res.status}) — draai create-affiliate-commissions-collection.mjs eerst.`);
    }
    throw new Error(`Directus read HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  for (const r of j.data || []) ids.add(String(r.click_id));
  return ids;
}

async function createBatch(rows) {
  if (rows.length === 0) return;
  const res = await fetch(`${DIRECTUS_URL}/items/${COLLECTION}`, {
    method: "POST", headers: dHeaders, body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Directus create HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function updateOne(row) {
  const { click_id, ...patch } = row;
  const res = await fetch(`${DIRECTUS_URL}/items/${COLLECTION}/${encodeURIComponent(click_id)}`, {
    method: "PATCH", headers: dHeaders, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Directus update ${click_id} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function run() {
  log(`Start. publisher=${CJ_PUBLISHER_ID} website=${CJ_WEBSITE_ID} lookback=${LOOKBACK_DAYS}d dryRun=${DRY_RUN}`);
  const records = await fetchAllCommissions();
  log(`CJ leverde ${records.length} commissie-records.`);

  // Dedupe by click_id, keep the record with the highest commissionId (latest state).
  const byClickId = new Map();
  for (const rec of records) {
    const row = toRow(rec);
    const prev = byClickId.get(row.click_id);
    if (!prev || Number(row.commission_id) >= Number(prev.commission_id)) byClickId.set(row.click_id, row);
  }
  const rows = [...byClickId.values()];
  log(`${rows.length} unieke click_id-rijen na dedupe.`);

  if (DRY_RUN) {
    log("DRY RUN — geen schrijfacties. Voorbeeld:", JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const existing = await existingClickIds();
  const creates = rows.filter((r) => !existing.has(r.click_id));
  const updates = rows.filter((r) => existing.has(r.click_id));

  await createBatch(creates);
  for (const r of updates) await updateOne(r);

  log(`Klaar. ${creates.length} nieuw, ${updates.length} bijgewerkt, ${rows.length} totaal verwerkt.`);
}

run().catch((e) => { console.error("[cj-import] FAILED:", e.message || e); process.exit(1); });
