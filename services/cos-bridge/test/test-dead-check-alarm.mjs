// LAT-6063 — test deadCheckStep() uit de échte monitor.js. Zelfde patroon als
// test-edge-cache-freshness.mjs / test-backoff.mjs: leest het bronbestand,
// snijdt het LAT-6063-blok eruit, importeert dat als een data:-module.
//
// Het punt van deze test is niet "vuurt hij" in abstracto, maar dat een
// aanhoudende fault — GH-rate-limit, kapotte build-info.json, CF onbereikbaar
// — één alarm oplevert (niet nul, niet één per cyclus), dat een hersteld
// verdict één herstelmelding oplevert, en dat een verwijderde/uitgeklede
// dead-check-logica deze test rood maakt (mutant hieronder).
import fs from "node:fs";

const src = fs.readFileSync(new URL("../monitor/monitor.js", import.meta.url), "utf8");

const a = src.indexOf("// --- LAT-6063: dead-check-waakhond");
const b = src.indexOf("if (!HMAC_SECRET)");
if (a === -1 || b === -1 || b < a) {
  throw new Error("LAT-6063-blok niet gevonden — monitor.js is gewijzigd, sync deze test");
}

const harness = `
${src.slice(a, b)}
export { deadCheckStep, getDeadCheckState, deadCheckState, DEAD_CHECK_THRESHOLD };
`;
const { deadCheckStep, getDeadCheckState, deadCheckState, DEAD_CHECK_THRESHOLD } = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log(`DEAD_CHECK_THRESHOLD = ${DEAD_CHECK_THRESHOLD}`);
check("drempel ruim boven de cyclus (>= 6)", DEAD_CHECK_THRESHOLD >= 6, String(DEAD_CHECK_THRESHOLD));

console.log("\ndeadCheckStep — aanhoudende fault");
{
  const state = { streak: 0, alerted: false };
  const fault = { fault: "GitHub Actions: HTTP 403 rate limited" };

  let lastAction;
  for (let i = 1; i < DEAD_CHECK_THRESHOLD; i++) {
    const r = deadCheckStep(state, fault, DEAD_CHECK_THRESHOLD);
    lastAction = r.action;
    check(`streak ${i}: geen alarm vóór de drempel`, r.action === "fault" && r.streak === i, JSON.stringify(r));
  }
  check("net onder de drempel: nog steeds geen alarm", lastAction === "fault");

  const atThreshold = deadCheckStep(state, fault, DEAD_CHECK_THRESHOLD);
  check(
    `streak = drempel (${DEAD_CHECK_THRESHOLD}): precies één alarm`,
    atThreshold.action === "alarm" && atThreshold.streak === DEAD_CHECK_THRESHOLD && atThreshold.fault === fault.fault,
    JSON.stringify(atThreshold)
  );

  // Blijft de fault staan, dan mag hij niet opnieuw alarmeren — dat zou de
  // client-side backoff omzeilen en 288 meldingen/dag opleveren (zie de
  // waarschuwing in de issue-opdracht).
  const stillFaulting = deadCheckStep(state, fault, DEAD_CHECK_THRESHOLD);
  check(
    "na het alarm: verdere faults alarmeren niet opnieuw",
    stillFaulting.action === "fault" && stillFaulting.streak === DEAD_CHECK_THRESHOLD + 1,
    JSON.stringify(stillFaulting)
  );
  const muchLater = deadCheckStep(state, fault, DEAD_CHECK_THRESHOLD);
  check("ook een tweede keer erna: nog steeds geen tweede alarm", muchLater.action === "fault");
}

console.log("\ndeadCheckStep — herstel");
{
  // Case A: check was nooit gealarmeerd (faalde maar bleef onder de drempel).
  // Terug naar een echt verdict is dan gewoon "ok", geen herstelmelding —
  // er was nooit een actief alarm om te herstellen.
  const neverAlarmed = { streak: 2, alerted: false };
  const backToHealthy = deadCheckStep(neverAlarmed, { sev: 0 }, DEAD_CHECK_THRESHOLD);
  check(
    "nooit gealarmeerd + weer gezond -> ok, geen herstelmelding",
    backToHealthy.action === "ok",
    JSON.stringify(backToHealthy)
  );
  check("streak reset na een echt verdict", neverAlarmed.streak === 0);

  // Case B: check WAS gealarmeerd; een echt verdict (ook sev=2, dat is nog
  // steeds een meting, geen fault) triggert precies één herstelmelding.
  const wasAlarmed = { streak: DEAD_CHECK_THRESHOLD, alerted: true };
  const recovered = deadCheckStep(wasAlarmed, { sev: 2, caching: ["/en/"] }, DEAD_CHECK_THRESHOLD);
  check("gealarmeerd + weer een verdict (ook sev=2) -> recover", recovered.action === "recover", JSON.stringify(recovered));
  check("alerted-vlag gereset na herstel", wasAlarmed.alerted === false);

  const secondHealthy = deadCheckStep(wasAlarmed, { sev: 0 }, DEAD_CHECK_THRESHOLD);
  check("daarna geen tweede herstelmelding voor dezelfde episode", secondHealthy.action === "ok", JSON.stringify(secondHealthy));
}

console.log("\ngetDeadCheckState — per-check isolatie");
{
  const s1 = getDeadCheckState("edge-cache-test");
  const s2 = getDeadCheckState("deploy-freshness-test");
  check("twee verschillende checks krijgen eigen state", s1 !== s2);
  deadCheckStep(s1, { fault: "x" }, DEAD_CHECK_THRESHOLD);
  check("check B blijft ongemoeid door check A", s2.streak === 0 && deadCheckState.get("deploy-freshness-test").streak === 0);
  check("herhaald opvragen geeft dezelfde state terug", getDeadCheckState("edge-cache-test") === s1);
}

console.log(`\n${failures === 0 ? "alle gevallen goed" : `${failures} FOUT(EN)`}`);
process.exit(failures === 0 ? 0 : 1);
