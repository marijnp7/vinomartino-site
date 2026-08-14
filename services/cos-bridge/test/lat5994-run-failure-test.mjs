// LAT-5994 — rood/groen-proef voor de bewaker op run-mislukkingen.
//
// Een groene run bewijst niets zolang niet is laten zien dat dezelfde check op
// de bekende storing rood wordt. Deze proef doet allebei, op de ECHTE rijen van
// 2026-08-14, en importeert daarvoor het predicaat uit ../monitor/runfail.js —
// hetzelfde bestand dat monitor.js importeert. Er is geen tweede kopie van de
// drempels; wie ze hier verandert, verandert ze in productie.
//
// Gebruik:
//   node services/cos-bridge/test/lat5994-run-failure-test.mjs          # alles
//   node services/cos-bridge/test/lat5994-run-failure-test.mjs --unit   # zonder DB
//
// DB-deel leest PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD, of DATABASE_URL.
import { pgQuery } from "../monitor/pgclient.js";
import {
  RUN_FAILURE_MIN_N,
  RUN_FAILURE_RATIO_THRESHOLD,
  atExpression,
  classifyRunFailures,
  formatRunFailureGroups,
  formatRunFailureLine,
  runFailureQueries,
  toSample,
} from "../monitor/runfail.js";

let failures = 0;
function check(name, cond, detail = "") {
  const mark = cond ? "GROEN" : "ROOD ";
  if (!cond) failures++;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

// --- 1. puur, zonder netwerk ------------------------------------------------
function unitTests() {
  console.log("\n== eenheidsproeven (puur, geen DB) ==");

  const outage = classifyRunFailures({
    n: 11, nfail: 11,
    groups: [{ error: "Claude run failed: ... Not logged in", n: 11, agents: 6 }],
  });
  check("100% mislukt bij n=11 → alarm", outage.sev === 2, formatRunFailureLine(outage));
  check("gedeelde oorzaak herkend (1 fout, 6 agents)", outage.shared === true);

  const calm = classifyRunFailures({ n: 40, nfail: 0, groups: [] });
  check("0% mislukt bij n=40 → gezond", calm.sev === 0 && !calm.undetermined);

  // De drempel moet aan BEIDE kanten scherp zijn, anders is niet bewezen dat
  // hij iets scheidt.
  const justUnder = classifyRunFailures({ n: 10, nfail: 2, groups: [{ error: "x", n: 2, agents: 1 }] });
  check(`20% (< ${RUN_FAILURE_RATIO_THRESHOLD}) → geen alarm`, justUnder.sev === 0);
  const justOver = classifyRunFailures({ n: 10, nfail: 3, groups: [{ error: "x", n: 3, agents: 1 }] });
  check(`30% (= drempel) → alarm`, justOver.sev === 2);

  const thin = classifyRunFailures({ n: 2, nfail: 2, groups: [{ error: "x", n: 2, agents: 1 }] });
  check(`n=2 (< ${RUN_FAILURE_MIN_N}) → onbepaald, niet groen`, thin.sev === 0 && thin.undetermined === true);
  check("onbepaald rapporteert n mee", formatRunFailureLine(thin).includes("2/2"));

  const blind = classifyRunFailures({ error: "connect-timeout naar db:5432" });
  check("mislukte meting → fault, nooit sev 0", Boolean(blind.fault) && blind.sev === undefined);

  // Verschillende fouten over verschillende agents is geen gedeelde oorzaak.
  const scattered = classifyRunFailures({
    n: 10, nfail: 6,
    groups: [
      { error: "Process lost -- child pid N", n: 2, agents: 1 },
      { error: "Prompt is too long", n: 2, agents: 1 },
      { error: "API Error: 529 Overloaded", n: 2, agents: 1 },
    ],
  });
  check("verspreide fouten → alarm maar geen gedeelde oorzaak", scattered.sev === 2 && scattered.shared === false);

  // De query-opbouw mag niets anders dan een letterlijke timestamp accepteren.
  let rejected = false;
  try { atExpression("2026-08-14'; drop table x; --"); } catch { rejected = true; }
  check("--at weigert niet-letterlijke invoer", rejected);
  check("--at accepteert een echte timestamp", atExpression("2026-08-14 12:00Z").includes("2026-08-14 12:00"));
}

// --- 2. replay op de echte rijen -------------------------------------------
async function sampleAt(at) {
  const q = runFailureQueries({ at });
  const [totals, groups] = await pgQuery([q.totals, q.groups], pgOptsFromEnv());
  return toSample(totals.rows, groups.rows);
}

function pgOptsFromEnv() {
  if (process.env.PGHOST) return {};
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("geen PGHOST en geen DATABASE_URL in de env");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

// Het venster van de storing is 11:34Z–12:33Z (LAT-5991). De check kijkt 15 min
// terug, dus een meting OP 12:00Z beslaat 11:45–12:00: midden in de storing.
// 11:30Z beslaat 11:15–11:30: het kwartier ervoor, waarin niets misging.
//
// Twee soorten "niet rood" horen hier allebei in, en ze zijn niet hetzelfde:
// 08:30Z had 12 wakes en nul mislukkingen (echt gezond), 11:30Z had er nul en
// levert daarom `onbepaald` op. Dat de check dat lege kwartier NIET groen noemt
// is geen tekortkoming maar het punt van RUN_FAILURE_MIN_N — deze vloot is vaak
// stil, en een bewaker die stilte als gezondheid leest is precies zo blind als
// een bewaker die niet draait.
const REPLAY = [
  { at: "2026-08-14 08:30Z", expect: 0, label: "ruim vóór de storing, mét verkeer" },
  { at: "2026-08-14 11:30Z", expect: "onbepaald", label: "kwartier vóór de storing (leeg venster)" },
  { at: "2026-08-14 11:50Z", expect: 2, label: "eerste kwartier van de storing" },
  { at: "2026-08-14 12:00Z", expect: 2, label: "midden in de storing" },
  { at: "2026-08-14 12:33Z", expect: 2, label: "einde van de storing" },
  { at: "2026-08-14 13:20Z", expect: 0, label: "na herstel" },
];

async function replayTests() {
  console.log("\n== replay op de echte rijen van 2026-08-14 ==");
  for (const c of REPLAY) {
    const verdict = classifyRunFailures(await sampleAt(c.at));
    if (verdict.fault) {
      check(`${c.at} (${c.label})`, false, `meting mislukte: ${verdict.fault}`);
      continue;
    }
    const got = verdict.undetermined ? "onbepaald" : verdict.sev;
    check(
      `${c.at} (${c.label}) → verwacht sev=${c.expect}`,
      got === c.expect,
      formatRunFailureLine(verdict)
    );
    if (verdict.sev === 2) {
      console.log(formatRunFailureGroups(verdict).split("\n").map((l) => `        ${l.trim()}`).join("\n"));
      check(`  ${c.at}: gedeelde oorzaak herkend`, verdict.shared === true);
    }
  }
}

// --- 3. mutatieproef: dezelfde rijen, drempel omhoog → alarm verdwijnt ------
// Zonder deze stap kan "rood" ook uit een bug komen die altijd rood geeft.
async function mutationTest() {
  console.log("\n== mutatieproef (zelfde rijen, andere drempel) ==");
  const sample = await sampleAt("2026-08-14 12:00Z");
  const strict = classifyRunFailures(sample, { ratioThreshold: 1.01 });
  check("drempel > 100% → hetzelfde venster is niet meer rood", strict.sev === 0);
  const loose = classifyRunFailures(sample, { ratioThreshold: 0.01 });
  check("drempel 1% → hetzelfde venster is rood", loose.sev === 2);
  const impossibleN = classifyRunFailures(sample, { minN: 10_000 });
  check("minimum-n boven het verkeer → onbepaald, niet groen", impossibleN.undetermined === true);
}

const unitOnly = process.argv.includes("--unit");
unitTests();
if (!unitOnly) {
  await replayTests();
  await mutationTest();
}
console.log(`\n${failures === 0 ? "ALLES GROEN" : `${failures} PROEF/PROEVEN ROOD`}`);
process.exit(failures === 0 ? 0 : 1);
