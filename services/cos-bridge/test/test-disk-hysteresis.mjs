// LAT-5494: hysterese op de disk-drempel. Leest de échte constanten en
// primitives uit monitor.js en simuleert checkDisk()'s beslislogica (fire
// boven DISK_THRESHOLD, clear pas onder DISK_RECOVERY_THRESHOLD) zonder df
// aan te roepen — zelfde aanpak als test-backoff.mjs.
import fs from "node:fs";

const src = fs.readFileSync(
  new URL("../monitor/monitor.js", import.meta.url),
  "utf8"
);

const constA = src.indexOf("const DISK_THRESHOLD");
// LAT-5123: de OAuth-guard ("// --- LAT-2790") die hier vroeger als
// eindmarkering diende is verwijderd (dood pad, altijd 403 — zie monitor.js).
// clearCondition() eindigt nu direct voor de HMAC_SECRET-guard.
const b = src.indexOf("if (!HMAC_SECRET)");
if (constA === -1 || b === -1 || b < constA) throw new Error("blok niet gevonden");

const harness = `
${src.slice(constA, b)}
export { shouldFire, clearCondition, DISK_THRESHOLD, DISK_RECOVERY_THRESHOLD };
`;
const { shouldFire, clearCondition, DISK_THRESHOLD, DISK_RECOVERY_THRESHOLD } = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
};

check("herstel-drempel ligt onder de alarm-drempel", DISK_RECOVERY_THRESHOLD < DISK_THRESHOLD);

// Zelfde beslislogica als checkDisk() in monitor.js.
function tick(key, usePct, t) {
  let fired = false;
  let recovered = false;
  if (usePct >= DISK_THRESHOLD) {
    if (shouldFire(key, t)) fired = true;
  } else if (usePct < DISK_RECOVERY_THRESHOLD) {
    if (clearCondition(key)) recovered = true;
  }
  return { fired, recovered };
}

console.log("\nFlapperende schijf (84↔85) — het LAT-5494-scenario");
{
  const key = "disk:/host";
  const M = 60 * 1000;
  // Precies de ochtenddigest-reeks: 22:38 85%, 22:43 84%, 23:03 85%, 00:03 85%.
  let t = 0;
  const r1 = tick(key, 85, t); t += 5 * M;
  const r2 = tick(key, 84, t); t += 20 * M;
  const r3 = tick(key, 85, t); t += 60 * M;
  const r4 = tick(key, 85, t);

  check("eerste 85% vuurt", r1.fired === true);
  check("84% (binnen hersteldrempel) herstelt NIET", r2.recovered === false);
  check("84% vuurt ook niet", r2.fired === false);
  check("tweede 85% (25 min later) vuurt niet opnieuw — backoff loopt door", r3.fired === false);
  // r4 valt op t=85 min sinds de eerste fire — buiten het 1u-backoffvenster,
  // dus dit IS de normale volgende melding (stap 1 → 4u), niet een nieuwe
  // flap-reset. De aanwezigheid van step-voortgang (niet terug op step 0) is
  // precies wat de hysterese oplevert t.o.v. het oude gedrag.
  check("derde 85% (85 min later) vuurt weer — backoff-stap, geen reset naar step 0", r4.fired === true);

  // Bewijs dat de stap is opgeschoven (4u-wachttijd) i.p.v. gereset (1u):
  // 61 min na r4 mag hij nog niet vuren op de oude 1u-stap, wél zou hij op
  // step 0 na 60 min al vuren — dit onderscheidt "doorlopende backoff" van
  // "reset door de flap".
  t += 61 * M;
  const r5 = tick(key, 85, t);
  check("61 min na de laatste fire nog stil — bewijst step 1 (4u), niet step 0 (1u)", r5.fired === false);
}

console.log("\nEchte daling onder de hersteldrempel herstelt wél");
{
  const key = "disk:/host2";
  const M = 60 * 1000;
  let t = 0;
  tick(key, 85, t); t += 5 * M;
  const r = tick(key, 81, t);
  check("81% (onder 82%) herstelt", r.recovered === true);
}

console.log("\nOude gedrag (zonder hysterese) zou hier wél opnieuw vuren — regressietoets op de constante zelf");
{
  check(`DISK_RECOVERY_THRESHOLD = 82`, DISK_RECOVERY_THRESHOLD === 82, `→ ${DISK_RECOVERY_THRESHOLD}`);
  check(`DISK_THRESHOLD = 85 (ongewijzigd)`, DISK_THRESHOLD === 85, `→ ${DISK_THRESHOLD}`);
}

console.log(failures === 0 ? "\nALLE TESTS OK" : `\n${failures} FOUT(EN)`);
process.exit(failures === 0 ? 0 : 1);
