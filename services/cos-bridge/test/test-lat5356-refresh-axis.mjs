// LAT-5356 — falsifieerbare test voor de refresh-as-herkenning in monitor.js.
// Oefent classifyRefreshGuard() uit tegen gevangen uitvoer van de échte
// oauth-token-guard.py, plus een gemuteerd rood geval, zonder container.
//
// Leest de échte monitor.js (geen kopie) — zie test-lat2905-guard-sentinel.mjs
// voor de reden waarom de volle module wordt geimporteerd i.p.v. een blok.
import fs from "node:fs";

process.env.APPROVAL_HMAC_SECRET = "test";

const src = fs.readFileSync(
  new URL("../monitor/monitor.js", import.meta.url),
  "utf8"
);
const harness = `${src}\nexport { classifyRefreshGuard };\n`;
const { classifyRefreshGuard } = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);

let failed = 0;
function check(name, cond, detail) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}` + (detail !== undefined ? ` -- ${JSON.stringify(detail)}` : ""));
  if (!cond) failed++;
}

// --- echte sentinel-regel, gevangen van de live bewaker, 2026-08-12 --------
const HEALTHY = "guard-refresh: oauth-token-guard-refresh schema=1 sev=0 code=0 days_left=9.68 deadline=2026-08-22T10:49:33.258000+00:00";
let v = classifyRefreshGuard(HEALTHY);
check("echte live-uitvoer parseert (groen)", v.sev === 0 && !v.fault, v);

// --- ROOD: gemuteerde regel binnen het waarschuwingsvenster -----------------
const WARN = "guard-refresh: oauth-token-guard-refresh schema=1 sev=1 code=20 days_left=2.31 deadline=2026-08-14T18:24:28.534000+00:00";
v = classifyRefreshGuard(WARN);
check("ROOD: gemuteerde warn-regel -> sev=1, geen fault", v.sev === 1 && !v.fault, v);

// --- ROOD: verlopen ----------------------------------------------------------
const EXPIRED = "guard-refresh: oauth-token-guard-refresh schema=1 sev=2 code=21 days_left=-0.04 deadline=2026-08-12T17:24:28.534000+00:00";
v = classifyRefreshGuard(EXPIRED);
check("ROOD: verlopen regel -> sev=2", v.sev === 2 && !v.fault, v);

// --- faalpaden ----------------------------------------------------------------
v = classifyRefreshGuard("no sentinel here at all");
check("ontbrekende sentinel -> fault, geen stille sev=0", !!v.fault, v);

v = classifyRefreshGuard("guard-refresh: oauth-token-guard-refresh schema=99 sev=0 code=0 days_left=1 deadline=x");
check("onbekend schema -> fault (forward-compat bewaker)", !!v.fault, v);

// --- ingebed in een volle multi-line guard-run (beide sentinels aanwezig) --
const FULL = [
  "guard: oauth-token-guard schema=2 sev=0 rc=0",
  WARN,
  "live      : /paperclip/.claude/.credentials.json",
  "access    : verloopt 2026-08-13T02:00:00+00:00  (7h35m te gaan)",
].join("\n");
v = classifyRefreshGuard(FULL);
check("vindt de guard-refresh-regel tussen andere uitvoer", v.sev === 1, v);

console.log(failed === 0 ? "\nalle checks geslaagd" : `\n${failed} check(s) FAIL`);
process.exit(failed === 0 ? 0 : 1);
