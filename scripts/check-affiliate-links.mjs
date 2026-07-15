#!/usr/bin/env node
/**
 * LAT-2531 — affiliate-linkguard (post-build, fail-closed).
 *
 * Draait NA `astro build` over de gegenereerde `dist/**\/*.html` en laat de
 * build ROOD vallen zodra een affiliate-link in de gepubliceerde HTML kapot of
 * onvolledig is. Aanleiding: twee integraties gingen live met links die niets
 * deden — LAT-2251 (Booking-deeplinks zonder CJ-wrapper → 0 attributie) en
 * LAT-2529 (alle 12 GYG-tourlinks stuk; 7x hard 404 doordat de tour-id in de
 * URL ontbrak). Beide keren betekende "live geverifieerd" in de praktijk
 * "de link staat in de HTML" i.p.v. "de link komt ergens zinvols aan".
 *
 * Filosofie = de beeldguard (LAT-2361/LAT-2379): fail-closed, liever een rode
 * build dan een stille kapotte affiliate-link in productie.
 *
 * Wat deze guard WEL deterministisch (offline, zonder netwerk) vangt:
 *   1. Vorm-/attributiedefecten van de UITGAANDE link, in het bijzonder:
 *      - GYG-tour-deeplink zonder canonieke tour-id (`-t<cijfers>`) → verzonnen
 *        pad → hard 404 (exact het LAT-2529-patroon: 7/7 zónder tour-id = 404).
 *      - GYG-link zonder `partner_id`/`cmp` (of verkeerd partner_id) → geen
 *        attributie (LAT-2251-klasse regressie).
 *      - Booking-deeplink die NIET door het CJ-klikdomein loopt maar wél
 *        `aid`/`label` draagt → LAT-2251-regressie (0 CJ-kliks).
 *      - Awin/Booking-deeplink met de placeholder-affiliate-id → nog niet echt.
 *
 * Wat deze guard NIET kan (bewust, zie het ticket): live vaststellen dat een
 * geldig-gevormde tour ná merge uit de catalogus verdween en nu 200-maar-
 * soft-redirect naar `/s?...` geeft. Dat vereist een echte headless browser
 * (curl krijgt 403 van GYG) en hoort in een aparte, niet-blokkerende nightly.
 * Deze offline guard dekt de grootste faalklasse (alle harde 404's + ontbrekende
 * attributie) zonder flaky netwerk in het blokkerende bouwpad.
 *
 * Uitbreiden naar een nieuwe partner (Sunny Cars, Stay22, …) = één regel in
 * AFFILIATE_RULES, niet per-partner hardcode elders.
 *
 * Exit 1 (met per-link rapport: pagina, volledige URL, reden) zodra dist een
 * kapotte affiliate-link bevat.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_DIR = process.env.DIST_DIR || process.argv[2] || 'dist';

// Directory-namen (direct onder DIST_DIR) die buiten de guard vallen. `preview`
// bevat component-demopagina's (bv. /preview/lat-1676-componenten) — geen
// gepubliceerde redactionele content, wél met opzettelijke placeholder-CTA's.
// Die horen niet het blokkerende bouwpad te bevriezen.
const SKIP_TOP_DIRS = new Set(['preview']);

// GYG partner_id is publiek en zit in affiliate-regio.ts (default CRMZDZ6, env
// kan overschrijven). We eisen exact deze waarde zodat een verkeerd/leeg account
// niet stil doorglipt.
const EXPECTED_GYG_PARTNER_ID = (process.env.GETYOURGUIDE_PARTNER_ID || 'CRMZDZ6').trim();

// CJ-klikdomeinen (kqzyfj.com = dpbolvw.net = anrdoezrs.net = …). Een correcte
// Booking-affiliate-link loopt HIERdoor (LAT-2251). Bron: src/lib/affiliates.ts.
const CJ_REDIRECT_HOSTS = new Set([
  'kqzyfj.com', 'anrdoezrs.net', 'jdoqocy.com', 'dpbolvw.net', 'tkqlhce.com',
  'ftjcfx.com', 'lduhtrp.net', 'emjcd.com', 'qksrv.net', 'awltovhc.com', 'cj.dotomi.com',
]);

// Placeholder-affiliate-id's die nooit in gepubliceerde HTML mogen staan
// (affiliate-regio.ts gebruikt ze tot de echte sign-up rond is).
const PLACEHOLDER_AFFILIATE_IDS = new Set([
  'VINOMARTINO_AWIN_PENDING',
]);

function normHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

// ── Per-partner validators ───────────────────────────────────────────────────
// Elke validator krijgt een URL-object en geeft null (ok) of een reden-string.

function validateGetYourGuide(u) {
  // Attributie: partner_id + cmp verplicht; partner_id moet ons account zijn.
  const partnerId = u.searchParams.get('partner_id');
  if (!partnerId) return 'GYG-link mist partner_id → geen attributie (LAT-2251-klasse)';
  if (partnerId !== EXPECTED_GYG_PARTNER_ID) {
    return `GYG partner_id="${partnerId}" ≠ verwacht "${EXPECTED_GYG_PARTNER_ID}" → attributie naar verkeerd account`;
  }
  if (!u.searchParams.get('cmp')) return 'GYG-link mist cmp= (campagnelabel) → geen per-regio attributie';

  // Vormvalidatie van het pad. Strip een leidend locale-segment (nl-nl, en, de-de).
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length > 0 && /^[a-z]{2}(-[a-z]{2})?$/.test(segments[0])) {
    segments.shift();
  }

  // Geen padsegment over → landings-/zoeklink (buildGetYourGuideLink). Dat is een
  // geldig, bewust patroon (knop met alleen tracking + q). Geen tour-id nodig.
  if (segments.length === 0) return null;

  // GYG's eigen zoekresultatenpad is `/s/?q=...` (één segment `s`). Dat is een
  // geldige 200-zoekpagina, geen tour-deeplink → geen tour-id vereist. Alleen het
  // kale `s`-segment; `/s/iets` valt door naar de tour-id-check.
  if (segments.length === 1 && segments[0] === 's') return null;

  // Wél een padsegment → dit hoort een concrete tour-deeplink te zijn. De
  // canonieke vorm eindigt op een tour-id `-t<cijfers>`. Ontbreekt die, dan is
  // het pad verzonnen → hard 404 (LAT-2529: 7/7 zónder tour-id = 404).
  const last = segments[segments.length - 1];
  if (!/-t\d+$/.test(last)) {
    return 'GYG-tour-deeplink zonder canonieke tour-id (-t<cijfers>) → verzonnen pad → hard 404 (LAT-2529)';
  }
  return null;
}

function validateBookingCj(u) {
  // Correcte Booking-affiliate-link loopt door het CJ-klikdomein met de schone
  // property-URL als `url=` en een per-pagina `sid=` (src/lib/affiliates.ts).
  const target = u.searchParams.get('url');
  if (!target) return 'CJ-klik-URL mist url= (de Booking-deeplink) → lege redirect';
  let targetHost;
  try { targetHost = normHost(new URL(target).hostname); } catch { targetHost = ''; }
  if (targetHost !== 'booking.com') {
    return `CJ-klik-URL url= wijst niet naar booking.com (host="${targetHost}")`;
  }
  if (!u.searchParams.get('sid')) return 'CJ-klik-URL mist sid= (per-pagina SubID) → geen CJ-rapportage';
  return null;
}

function validateBookingDirect(u) {
  // Een DIRECTE booking.com-href die Booking's eigen affiliate-params (aid/label)
  // draagt maar niet door het CJ-klikdomein loopt = precies de LAT-2251-regressie:
  // Booking's aid/label passeert CJ niet → 0 kliks. Bare, ongetagde booking.com-
  // vermeldingen (redactioneel) laten we met rust om vals-positieven te vermijden.
  if (u.searchParams.has('aid') || u.searchParams.has('label')) {
    return 'Directe booking.com-deeplink met aid/label maar zónder CJ-klikdomein → 0 attributie (LAT-2251-regressie)';
  }
  return null;
}

function validateAwin(u) {
  // Awin cread-redirect (affiliate-regio buildBookingAwinLink). Placeholder-affid
  // of ontbrekende ued = kapotte affiliate-link.
  const affid = u.searchParams.get('awinaffid');
  if (!affid) return 'Awin-link mist awinaffid';
  if (PLACEHOLDER_AFFILIATE_IDS.has(affid)) return `Awin-link gebruikt placeholder-affid "${affid}" → nog geen echte tracking`;
  if (!u.searchParams.get('ued')) return 'Awin cread-link mist ued= (de eindbestemming)';
  return null;
}

// ── Partner-register (generiek; nieuwe partner = één regel) ───────────────────
const AFFILIATE_RULES = [
  { name: 'getyourguide', matchHost: (h) => /(^|\.)getyourguide\.[a-z.]+$/.test(h), validate: validateGetYourGuide },
  { name: 'booking-cj', matchHost: (h) => CJ_REDIRECT_HOSTS.has(h), validate: validateBookingCj },
  { name: 'booking-direct', matchHost: (h) => h === 'booking.com', validate: validateBookingDirect },
  { name: 'awin', matchHost: (h) => /(^|\.)awin1\.com$/.test(h), validate: validateAwin },
  // Toekomst: Sunny Cars (TradeTracker), Stay22 → voeg hier een regel toe.
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

const HREF_RE = /href\s*=\s*("([^"]*)"|'([^']*)')/gi;

/**
 * Scan één HTML-string op kapotte affiliate-hrefs.
 * @returns {{url:string, partner:string, reason:string}[]}
 */
export function scanHtml(html) {
  const violations = [];
  const seen = new Set();
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) {
    const raw = decodeEntities((m[2] ?? m[3] ?? '').trim());
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) continue;
    let u;
    try { u = new URL(raw); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    const host = normHost(u.hostname);
    const rule = AFFILIATE_RULES.find((r) => r.matchHost(host));
    if (!rule) continue;
    const reason = rule.validate(u);
    if (reason) {
      const key = `${rule.name}::${raw}::${reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({ url: raw, partner: rule.name, reason });
    }
  }
  return violations;
}

async function* walkHtml(dir, isTop = false) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isTop && SKIP_TOP_DIRS.has(entry.name)) continue;
      yield* walkHtml(full);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      yield full;
    }
  }
}

async function main() {
  const hits = [];
  let scanned = 0;
  for await (const file of walkHtml(DIST_DIR, true)) {
    scanned++;
    const html = await readFile(file, 'utf8');
    for (const v of scanHtml(html)) {
      hits.push({ file, ...v });
    }
  }

  if (scanned === 0) {
    console.error(`[affiliate-guard] FAIL: geen HTML gevonden in '${DIST_DIR}' — is de build gelukt?`);
    process.exit(1);
  }

  if (hits.length > 0) {
    console.error(`[affiliate-guard] FAIL: ${hits.length} kapotte affiliate-link(s) in gepubliceerde HTML (LAT-2531):\n`);
    for (const h of hits) {
      console.error(`  ✗ ${h.file}`);
      console.error(`    partner : ${h.partner}`);
      console.error(`    url     : ${h.url}`);
      console.error(`    reden   : ${h.reason}\n`);
    }
    console.error('[affiliate-guard] Repareer de bronlink (Directus/config) — een affiliate-link verifieer je in een browser, nooit met curl: "rendert" is niet "werkt". De deploy is geblokkeerd.');
    process.exit(1);
  }

  console.log(`[affiliate-guard] OK: ${scanned} HTML-bestanden gescand, geen kapotte affiliate-links.`);
}

// Alleen draaien als CLI (niet bij import vanuit de test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[affiliate-guard] onverwachte fout: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
  });
}
