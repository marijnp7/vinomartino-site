// LAT-2909 — replay van de nacht 24→25 juli tegen de nieuwe herhaal-rem.
//
// Er is geen testharnas voor de bridge en de enige echte proef (een nacht
// draaien) duurt een nacht. Deze replay is de op één na beste: hij neemt de
// ECHTE rijen uit `cos.actions`, laat de nieuwe regel er chronologisch
// overheen lopen en telt hoeveel pushes er dan overblijven.
//
// Drie toetsen:
//   1. FIDELITEIT — `bundleKey(agent, proposal)` zonder alert_key moet exact de
//      sleutel teruggeven die in productie is opgeslagen. Bewijst dat het oude
//      pad (elke agent die géén alert_key stuurt) onveranderd is.
//   2. STABILITEIT — twee opeenvolgende `Disk usage`-meldingen krijgen dezelfde
//      sleutel. Dat is de tweede eis uit de definition of done.
//   3. REPLAY — hoeveel van de 16 nachtelijke critical-pushes blijven over.
//
// `bundleKey` wordt uit de bronfile GESNEDEN, niet overgetypt: een kopie die
// uit de pas loopt met src/index.js zou een groene test opleveren voor code die
// niet draait.
//
// Draaien:  node test/lat2909-replay.mjs <rows.ndjson>
// waarbij rows.ndjson één row_to_json per regel is uit:
//   SELECT id, created_at, pushed_at, requester_agent, urgency, bundle_key,
//          decision, proposal FROM cos.actions ORDER BY id;

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src", "index.js");

// ---- bundleKey uit de echte bron halen ------------------------------------
function loadBundleKey() {
  const src = fs.readFileSync(SRC, "utf8");
  const start = src.indexOf("function bundleKey(");
  if (start < 0) throw new Error("bundleKey() niet gevonden in " + SRC);
  const end = src.indexOf("\n}\n", start);
  if (end < 0) throw new Error("einde van bundleKey() niet gevonden");
  const body = src.slice(start, end + 2);
  return new Function("crypto", `${body}; return bundleKey;`)(crypto);
}
const bundleKey = loadBundleKey();

// ---- dezelfde afbeelding titel → alert_key als de nieuwe monitor.js --------
// Alleen nodig voor de replay: de historische rijen zijn verstuurd vóór
// monitor.js een alert_key meestuurde, dus die leiden we hier af uit de titel.
function alertKeyForMonitorTitle(title) {
  let m = /^Disk usage: \d+% on (\S+)/.exec(title);
  if (m) return `disk:${m[1]}`;
  m = /^Container restarting: (\S+)/.exec(title);
  if (m) return `restart:${m[1]}`;
  if (/^OAuth token CRITICAL/.test(title)) return "oauth:token-critical";
  if (/^CLI config damaged \+ OAuth token expiring/.test(title)) return "oauth:config-and-token";
  if (/^CLI config integrity failure/.test(title)) return "oauth:config-damaged";
  if (/^OAuth token expiring soon/.test(title)) return "oauth:token-expiring";
  if (/^OAuth-bewaker ONBEREIKBAAR/.test(title)) return "oauth:guard-unreachable";
  return null;
}

const QSTART = 22;
const QEND = 8; // productiewaarde, zie `docker exec paperclip-cos-bridge-1 env`
const REPEAT_WINDOW_H = 12;
const TZ = "Europe/Amsterdam";

function localHour(iso) {
  return Number(
    new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", hour12: false }).format(
      new Date(iso)
    )
  );
}
function localStamp(iso) {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TZ, day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}
const isQuiet = (iso) => (QSTART > QEND ? localHour(iso) >= QSTART || localHour(iso) < QEND : false);

// ---- rows inlezen ----------------------------------------------------------
const file = process.argv[2];
if (!file) {
  console.error("usage: node test/lat2909-replay.mjs <rows.ndjson>");
  process.exit(2);
}
const rows = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

// ---- 1. fideliteit ---------------------------------------------------------
console.log("\n1. FIDELITEIT — oude sleutel onveranderd zonder alert_key");
const stored = rows.filter((r) => r.bundle_key);
let mismatch = 0;
for (const r of stored) {
  if (bundleKey(r.requester_agent, r.proposal) !== r.bundle_key) {
    mismatch++;
    if (mismatch <= 3) console.log(`       #${r.id} verwacht ${r.bundle_key}`);
  }
}
check(
  stored.length > 0 && mismatch === 0,
  `${stored.length} rijen met een opgeslagen bundle_key recomputen identiek`,
  mismatch ? `${mismatch} afwijkingen` : ""
);

// ---- 2. stabiliteit over herhalingen ---------------------------------------
console.log("\n2. STABILITEIT — definition of done: twee opeenvolgende Disk usage-alerts, gelijke sleutel");
const disk = rows.filter(
  (r) => r.requester_agent === "DevOps Monitor" && /^Disk usage:/.test(r.proposal.split("\n")[0])
);
const oldKeys = new Set(disk.map((r) => bundleKey(r.requester_agent, r.proposal)));
const newKeys = new Set(
  disk.map((r) => bundleKey(r.requester_agent, r.proposal, alertKeyForMonitorTitle(r.proposal.split("\n")[0])))
);
console.log(`       ${disk.length} Disk usage-meldingen in de tabel`);
check(oldKeys.size > 1, `oud: ${oldKeys.size} verschillende sleutels (dit was de bug)`);
check(newKeys.size === 1, `nieuw: ${newKeys.size} sleutel — ${[...newKeys][0]}`);

// expliciet het paar uit de issue-tekst: 91% en 92% achter elkaar
const pair = [
  disk.find((r) => /^Disk usage: 92%/.test(r.proposal)),
  disk.find((r) => /^Disk usage: 91%/.test(r.proposal)),
].filter(Boolean);
if (pair.length === 2) {
  const [a, b] = pair.map((r) =>
    bundleKey(r.requester_agent, r.proposal, alertKeyForMonitorTitle(r.proposal.split("\n")[0]))
  );
  check(a === b, `92% (#${pair[0].id}) en 91% (#${pair[1].id}) delen een sleutel`, a);
}

// ---- 3. replay van de nacht ------------------------------------------------
console.log("\n3. REPLAY — nacht 24→25 juli door de nieuwe regel");
const night = rows.filter(
  (r) =>
    r.created_at >= "2026-07-24T20:00:00" &&
    r.created_at < "2026-07-25T06:00:00" &&
    isQuiet(r.created_at)
);

// pushed_at per sleutel, precies zoals de bridge het opvraagt: alleen ECHT
// afgeleverde meldingen remmen, een geparkeerde herhaling telt niet mee.
const lastPush = new Map();

// De rem kijkt 12 uur terug, en dat reikt tot vóór het venster. Een melding die
// om 21:51 nog overdag is gepusht, maakt de melding van 22:51 dus tot een
// herhaling. Die voorgeschiedenis hoort in de replay, anders meet hij een
// gunstiger nacht dan de regel oplevert.
const windowStart = Date.parse(night[0].created_at);
for (const r of rows) {
  if (!r.pushed_at) continue;
  const t = Date.parse(r.pushed_at);
  if (t >= windowStart || t < windowStart - REPEAT_WINDOW_H * 3600_000) continue;
  const title = r.proposal.split("\n")[0];
  const ak = r.requester_agent === "DevOps Monitor" ? alertKeyForMonitorTitle(title) : null;
  lastPush.set(bundleKey(r.requester_agent, r.proposal, ak), t);
}
const lastPushSeed = new Set(lastPush.keys());
console.log(`       voorgeschiedenis: ${lastPush.size} sleutels gepusht in de 12 uur vóór het venster`);

let pushes = 0;
let parked = 0;
const log = [];
for (const r of night) {
  const title = r.proposal.split("\n")[0];
  const ak = r.requester_agent === "DevOps Monitor" ? alertKeyForMonitorTitle(title) : null;
  const key = bundleKey(r.requester_agent, r.proposal, ak);
  const t = Date.parse(r.created_at);

  let verdict;
  if (r.urgency !== "critical") {
    verdict = "geparkeerd (normal)";
  } else {
    const prev = lastPush.get(key);
    const isRepeat = prev !== undefined && t - prev < REPEAT_WINDOW_H * 3600_000;
    verdict = isRepeat ? "GEPARKEERD (herhaling)" : "push (nieuwe storing)";
  }
  if (verdict.startsWith("push")) {
    pushes++;
    lastPush.set(key, t);
  } else parked++;
  log.push(`       ${localStamp(r.created_at)}  #${String(r.id).padEnd(4)} ${verdict.padEnd(23)} ${title.slice(0, 46)}`);
}
console.log(log.join("\n"));

const wasPushed = night.filter((r) => r.pushed_at && Date.parse(r.pushed_at) - Date.parse(r.created_at) < 60_000).length;
console.log(`\n       toen : ${wasPushed} pushes / ${night.length} aanvragen`);
console.log(`       nu   : ${pushes} pushes / ${night.length} aanvragen (${parked} geparkeerd)`);
check(night.length >= 15, `${night.length} aanvragen in het venster gemeten`);
check(pushes < wasPushed, `${wasPushed - pushes} pushes minder`);
check(pushes >= 1, "de escape-hatch blijft open: een eerste voorkomen komt door");

// Geen enkele sleutel mag twee keer door het venster breken. Dát is de regel;
// "één push per storing" is het NIET — de schijfmelding is om 21:51 al overdag
// afgeleverd en hoort daarna te zwijgen, ook al is 22:51 zijn eerste voorkomen
// binnen het venster. De 12-uurs terugblik is precies daarvoor.
const pushedKeys = [];
const seen2 = new Map();
for (const r of night) {
  if (r.urgency !== "critical") continue;
  const title = r.proposal.split("\n")[0];
  const key = bundleKey(
    r.requester_agent,
    r.proposal,
    r.requester_agent === "DevOps Monitor" ? alertKeyForMonitorTitle(title) : null
  );
  const t = Date.parse(r.created_at);
  const prev = seen2.get(key);
  if (prev === undefined || t - prev >= REPEAT_WINDOW_H * 3600_000) {
    if (!lastPushSeed.has(key)) pushedKeys.push(key);
    seen2.set(key, t);
  }
}
check(
  new Set(pushedKeys).size === pushedKeys.length,
  `geen sleutel breekt twee keer door (${pushedKeys.length} doorbraken, ${new Set(pushedKeys).size} uniek)`
);
check(
  pushes === pushedKeys.length,
  `alleen storingen die niet al binnen 12 uur gemeld waren komen door (${pushes})`
);

console.log(`\n${failures === 0 ? "ALLE TOETSEN GROEN" : failures + " TOETS(EN) ROOD"}\n`);
process.exit(failures === 0 ? 0 : 1);
