// LAT-7014 — regressietest op classifyDeployFreshness() zonder de monitor te starten.
//
// monitor.js start bij import zijn check-loop, dus we kunnen hem niet importeren.
// In plaats van de functie hier te dupliceren (die kopie loopt gegarandeerd uit de
// pas) snijden we hem bij het draaien uit de bron. Zo test dit altijd de echte code.
//
// Draaien: node services/cos-bridge/monitor/test_classify.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "monitor.js"), "utf8");

const start = src.indexOf("function classifyDeployFreshness");
const end = src.indexOf("\nasync function checkDeployFreshness");
if (start === -1 || end === -1 || end < start) {
  console.error("FOUT: classifyDeployFreshness() niet uit monitor.js te snijden — is de functie hernoemd?");
  process.exit(1);
}

const DEPLOY_STALE_THRESHOLD_MS = 20 * 60 * 1000;
const classifyDeployFreshness = new Function(
  "DEPLOY_STALE_THRESHOLD_MS",
  `${src.slice(start, end)}\nreturn classifyDeployFreshness;`
)(DEPLOY_STALE_THRESHOLD_MS);

const now = Date.parse("2026-09-18T14:20:00Z");

// De eerste drie gevallen zijn de false positives die ~50 keer per dag een
// Telegram-push opleverden: GitHub gaf een stale pagina terug waarop de nieuwste
// deploy ontbrak. Het vierde geval is de storing die de check MOET blijven zien.
const gevallen = [
  ["gelijke sha", { sha: "aaa", runNumber: "1081" }, { sha: "aaa", runNumber: 1081, completedAt: "2026-09-17T05:06:58Z" }, 0],
  ["stale index: oudere run dan live", { sha: "aaa", runNumber: "1081" }, { sha: "bbb", runNumber: 1076, completedAt: "2026-09-07T05:07:02Z" }, 0],
  ["stale index: zelfde run, andere sha", { sha: "aaa", runNumber: "1081" }, { sha: "bbb", runNumber: 1081, completedAt: "2026-09-17T05:06:58Z" }, 0],
  ["echte achterstand: nieuwere run", { sha: "aaa", runNumber: "1081" }, { sha: "ccc", runNumber: 1082, completedAt: "2026-09-18T06:00:00Z" }, 2],
  ["nieuwere run, nog binnen de drempel", { sha: "aaa", runNumber: "1081" }, { sha: "ccc", runNumber: 1082, completedAt: "2026-09-18T14:10:00Z" }, 0],
  ["build-info zonder runNumber valt terug op de oude sha+leeftijd-regel", { sha: "aaa" }, { sha: "ccc", runNumber: 1082, completedAt: "2026-09-18T06:00:00Z" }, 2],
];

let gefaald = 0;
for (const [naam, live, deploy, verwacht] of gevallen) {
  const { sev } = classifyDeployFreshness(live, deploy, now);
  const ok = sev === verwacht;
  if (!ok) gefaald += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${naam} -> sev=${sev} (verwacht ${verwacht})`);
}

console.log(gefaald === 0 ? "ALLE TESTS GESLAAGD" : `${gefaald} TEST(S) GEFAALD`);
process.exit(gefaald === 0 ? 0 : 1);
