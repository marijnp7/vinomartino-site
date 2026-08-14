// LAT-3210 — test classifyEdgeCacheStatuses() en classifyDeployFreshness()
// uit de échte monitor.js. Dom en zonder netwerk testbaar, zelfde patroon als
// test-backoff.mjs: leest het bronbestand, snijdt het LAT-3210-blok eruit,
// importeert dat als een data:-module.
//
// Het punt van deze test is niet "detecteert hij caching" in abstracto, maar
// dat hij het 19-07-incident (/en/ HIT terwijl / en /streken/... DYNAMIC
// bleven) herkent, en dat een onbereikbare bron (CF óf GitHub óf de
// live build-info) nooit als "gezond"/"gelijk" gelezen wordt.
import fs from "node:fs";

const src = fs.readFileSync(new URL("../monitor/monitor.js", import.meta.url), "utf8");

const consts = src.indexOf("// --- LAT-3210: edge-cache-waakhond");
const constsEnd = src.indexOf("// --- LAT-2802");
const a = src.indexOf("function classifyEdgeCacheStatuses");
const b = src.indexOf("async function checkEdgeCacheStatus");
const c = src.indexOf("function classifyDeployFreshness");
const d = src.indexOf("async function checkDeployFreshness");
if ([consts, constsEnd, a, b, c, d].some((i) => i === -1) || constsEnd < consts || b < a || c < b || d < c) {
  throw new Error("blokken niet gevonden — monitor.js is gewijzigd, sync deze test");
}

const harness = `
${src.slice(consts, constsEnd)}
${src.slice(a, b)}
${src.slice(c, d)}
export { classifyEdgeCacheStatuses, classifyDeployFreshness };
`;
const { classifyEdgeCacheStatuses, classifyDeployFreshness } = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
};

const route = (r, cfCacheStatus, lastModified = "Sat, 01 Aug 2026 07:30:00 GMT") => ({
  route: r,
  cfCacheStatus,
  lastModified,
});

console.log("classifyEdgeCacheStatuses");
{
  const gezond = classifyEdgeCacheStatuses([
    route("/", "DYNAMIC"),
    route("/en/", "DYNAMIC"),
    route("/streken/bourgogne/", "DYNAMIC"),
  ]);
  check("alle DYNAMIC -> sev 0", gezond.sev === 0 && gezond.fault === undefined, JSON.stringify(gezond));

  const bypass = classifyEdgeCacheStatuses([route("/", "BYPASS"), route("/en/", "DYNAMIC")]);
  check("BYPASS is ook gezond", bypass.sev === 0, JSON.stringify(bypass));

  // Het letterlijke 19-07-scenario: /en/ cachet, de rest niet.
  const incident = classifyEdgeCacheStatuses([
    route("/", "DYNAMIC"),
    route("/en/", "HIT"),
    route("/streken/bourgogne/", "DYNAMIC"),
  ]);
  check(
    "19-07-scenario (/en/ HIT) wordt herkend als regressie",
    incident.sev === 2 && incident.caching.length === 1 && incident.caching[0] === "/en/",
    JSON.stringify(incident)
  );

  // MISS is óók fout voor HTML — dat is het moment vóór de eerste HIT.
  const missAll = classifyEdgeCacheStatuses([
    route("/", "MISS"),
    route("/en/", "MISS"),
    route("/streken/bourgogne/", "MISS"),
  ]);
  check("MISS op alle drie routes telt als caching, niet als gezond", missAll.sev === 2 && missAll.caching.length === 3, JSON.stringify(missAll));

  const geenBron = classifyEdgeCacheStatuses([route("/", undefined), route("/en/", undefined)]);
  check(
    "geen enkele route geeft cf-cache-status terug -> fault, geen sev",
    typeof geenBron.fault === "string" && geenBron.sev === undefined,
    JSON.stringify(geenBron)
  );

  // Eén onbereikbare route naast twee gezonde is geen storing — de gezonde
  // routes blijven het antwoord bepalen.
  const partieel = classifyEdgeCacheStatuses([route("/", "DYNAMIC"), route("/en/", undefined), route("/s/", "DYNAMIC")]);
  check("gedeeltelijk onbereikbaar blijft leesbaar via de rest", partieel.sev === 0, JSON.stringify(partieel));
}

console.log("\nclassifyDeployFreshness");
{
  const now = 1_800_000_000_000; // vast ankerpunt, geen Date.now()
  const live = (sha) => ({ sha, builtAt: "2026-08-01T07:13:52Z", runNumber: 939 });
  const deploy = (sha, ageMs) => ({ sha, completedAt: new Date(now - ageMs).toISOString(), runNumber: 941 });

  check("sha's gelijk -> sev 0", classifyDeployFreshness(live("abc"), deploy("abc", 0), now).sev === 0);

  check(
    "grens: precies 20 min oud is stale",
    classifyDeployFreshness(live("abc"), deploy("def", 20 * 60 * 1000), now).sev === 2
  );
  check(
    "grens: 20 min min 1ms is nog geen stale (deploy loopt mogelijk nog)",
    classifyDeployFreshness(live("abc"), deploy("def", 20 * 60 * 1000 - 1), now).sev === 0
  );

  // Het 19-07-incident geherformuleerd: sha's verschillen, laatste deploy 45
  // min geleden -> dit had het binnen minuten gevonden.
  const stale = classifyDeployFreshness(live("oud-sha"), deploy("nieuw-sha", 45 * 60 * 1000), now);
  check("45 min stale wordt herkend", stale.sev === 2 && stale.ageMs === 45 * 60 * 1000, JSON.stringify(stale));

  const liveDown = classifyDeployFreshness({ error: "build-info.json onbereikbaar of zonder sha: HTTP 522" }, deploy("abc", 0), now);
  check("live build-info.json onbereikbaar -> fault, geen sev", typeof liveDown.fault === "string" && liveDown.sev === undefined, JSON.stringify(liveDown));

  const ghDown = classifyDeployFreshness(live("abc"), { error: "GitHub Actions-antwoord onbereikbaar of onvolledig: HTTP 403: rate limited" }, now);
  check("GitHub Actions onbereikbaar -> fault, geen sev", typeof ghDown.fault === "string" && ghDown.sev === undefined, JSON.stringify(ghDown));
}

console.log(`\n${failures === 0 ? "alle gevallen goed" : `${failures} FOUT(EN)`}`);
process.exit(failures === 0 ? 0 : 1);
