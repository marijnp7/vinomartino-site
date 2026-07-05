#!/usr/bin/env node
/**
 * Migration: create the `affiliate_commissions` collection (LAT-1789, Phase 3 of LAT-1780).
 *
 * Holds the CJ (Commission Junction) Commission Detail import, keyed on `click_id`
 * (= the CJ `sid` we pass as `clkid` in the Booking.com affiliate label, see
 * src/lib/affiliates.ts). The daily import (import-cj-commissions.mjs) upserts on
 * `click_id`. The intern dashboard (/intern/dashboard/) reads this collection to
 * reconcile tracked clicks against CJ-reported commissions.
 *
 * Mirrors the affiliate_clicks read-permission onto every policy that can read
 * affiliate_clicks, so the SSG build/content token can read the new collection too.
 *
 * Run (needs an admin LOGIN token — the restricted ADMIN_TOKEN 403s on /collections):
 *   DIRECTUS_URL=http://directus:8055 DIRECTUS_TOKEN=<admin-login-token> \
 *     node directus/scripts/create-affiliate-commissions-collection.mjs
 *
 * Idempotent: existing collection/fields/permissions are skipped, so re-runs are safe.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://directus:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error("DIRECTUS_TOKEN is required (admin LOGIN token).");
  process.exit(1);
}

const COLLECTION = "affiliate_commissions";
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const exists = res.status === 409 || /already exists|exists$/i.test(text) || /has to be unique/i.test(text);
  return { ok: res.status >= 200 && res.status < 300, status: res.status, text, exists };
}

function str(field, note, extra = {}) {
  return {
    field,
    type: "string",
    meta: { interface: "input", width: "half", note, ...extra.meta },
    schema: { is_nullable: true, ...extra.schema },
  };
}
function num(field, note) {
  return {
    field,
    type: "float",
    meta: { interface: "input", width: "half", note, display: "formatted-value" },
    schema: { is_nullable: true },
  };
}
function ts(field, note) {
  return {
    field,
    type: "timestamp",
    meta: { interface: "datetime", width: "half", note },
    schema: { is_nullable: true },
  };
}

const FIELDS = [
  {
    field: "click_id",
    type: "string",
    meta: { interface: "input", width: "half", note: "CJ sid = onze clkid (PK). Fallback cj-<commissionId> als sid leeg." },
    schema: { is_primary_key: true, is_nullable: false, has_auto_increment: false },
  },
  str("commission_id", "CJ commissionId (traceability)."),
  str("partner", "CJ advertiserName (bv. Booking.com)."),
  str("region", "Afgeleid uit sid (deel na het type-token)."),
  str("placement", "Afgeleid uit sid (type-token, bv. accommodation)."),
  num("commission_usd", "pubCommissionAmountUsd."),
  num("commission_eur", "pubCommissionAmountPubCurrency (publisher-valuta = EUR)."),
  num("sale_amount_usd", "saleAmountUsd."),
  str("action_status", "CJ actionStatus (new/locked/closed/...)."),
  str("country", "CJ country."),
  ts("event_date", "CJ eventDate (UTC) — conversiemoment."),
  ts("posting_date", "CJ postingDate (UTC)."),
  ts("imported_at", "Tijdstip van laatste sync (UTC)."),
];

async function createCollection() {
  process.stdout.write(`  + collection ${COLLECTION} ... `);
  const res = await api("POST", "/collections", {
    collection: COLLECTION,
    meta: {
      icon: "paid",
      note: "CJ Commission Detail import (LAT-1789). Upsert op click_id.",
      hidden: false,
      singleton: false,
      sort_field: null,
    },
    schema: {},
    fields: [FIELDS[0]], // create with the manual PK only; rest added via /fields
  });
  if (res.exists) { console.log("already exists, skipping"); return; }
  if (res.ok) { console.log("OK"); return; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 300)}`);
  process.exit(1);
}

async function addFields() {
  for (const f of FIELDS.slice(1)) {
    process.stdout.write(`  + ${COLLECTION}.${f.field} ... `);
    const res = await api("POST", `/fields/${COLLECTION}`, f);
    if (res.exists) { console.log("exists, skip"); continue; }
    if (res.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
    process.exit(1);
  }
}

async function mirrorReadPermissions() {
  // Copy every affiliate_clicks read-permission onto affiliate_commissions so the
  // same policies (incl. the SSG build/content token) can read the new collection.
  const res = await api("GET", `/permissions?filter[collection][_eq]=affiliate_clicks&filter[action][_eq]=read&limit=-1`);
  if (!res.ok) {
    console.log(`  ! could not read affiliate_clicks permissions (${res.status}); skipping mirror. Set read-perm manually.`);
    return;
  }
  let perms = [];
  try { perms = JSON.parse(res.text).data || []; } catch { perms = []; }
  if (perms.length === 0) {
    console.log("  ! no affiliate_clicks read-permissions found to mirror. Set read-perm for build token manually.");
    return;
  }
  for (const p of perms) {
    const policyLabel = p.policy || "(public)";
    process.stdout.write(`  + read-perm clone policy=${policyLabel} ... `);
    const clone = {
      policy: p.policy,
      collection: COLLECTION,
      action: "read",
      permissions: p.permissions ?? {},
      validation: p.validation ?? {},
      presets: p.presets ?? null,
      fields: p.fields ?? ["*"],
    };
    const cr = await api("POST", "/permissions", clone);
    if (cr.exists) { console.log("exists, skip"); continue; }
    if (cr.ok) { console.log("OK"); continue; }
    console.log(`FAIL (${cr.status}): ${cr.text.slice(0, 200)}`);
  }
}

async function run() {
  console.log(`\nCreate collection ${COLLECTION}`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createCollection();
  await addFields();
  await mirrorReadPermissions();
  console.log("\nDone. Verify in Directus UI and confirm the build/content token can read affiliate_commissions.");
}

run().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
