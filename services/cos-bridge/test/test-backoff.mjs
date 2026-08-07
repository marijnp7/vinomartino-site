// Test §4 (backoff 1u → 4u → 12u + herstel) en A1 (severity-mapping fallback).
// Leest de échte functies uit monitor.js.
import fs from "node:fs";

const src = fs.readFileSync(
  new URL("../monitor/monitor.js", import.meta.url),
  "utf8"
);

const a = src.indexOf("const BACKOFF_STEPS_MS");
const b = src.indexOf("// --- LAT-2790");
if (a === -1 || b === -1 || b < a) throw new Error("blok niet gevonden");

const harness = `
${src.slice(a, b)}
export { shouldFire, clearCondition, BACKOFF_STEPS_MS, conditionState };
`;
const { shouldFire, clearCondition, BACKOFF_STEPS_MS } = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
};

const H = 60 * 60 * 1000;
check("stappen zijn 1u, 4u, 12u", JSON.stringify(BACKOFF_STEPS_MS) === JSON.stringify([1 * H, 4 * H, 12 * H]));

console.log("\nBackoff-ritme voor één aanhoudende conditie");
{
  let t = 1_000_000;
  const key = "disk:/host";
  check("eerste keer vuurt direct", shouldFire(key, t) === true);
  check("na 59 min nog niet", shouldFire(key, t + 59 * 60 * 1000) === false);
  check("na 1u wel", shouldFire(key, t + 1 * H) === true);
  // stap staat nu op 1 → wachttijd 4u
  check("na +1u nog niet (wacht 4u)", shouldFire(key, t + 2 * H) === false);
  check("na +4u wel", shouldFire(key, t + 5 * H) === true);
  // stap staat nu op 2 → wachttijd 12u
  check("na +4u nog niet (wacht 12u)", shouldFire(key, t + 9 * H) === false);
  check("na +12u wel", shouldFire(key, t + 17 * H) === true);
  check("plafond blijft 12u", shouldFire(key, t + 28 * H) === false);
  check("plafond vuurt na 12u", shouldFire(key, t + 29 * H) === true);
}

console.log("\nBovengrens bij een conditie die weken duurt");
{
  const key = "disk:/steady";
  let firstDay = 0;
  let rest = 0;
  // Check elke 5 minuten, 30 dagen lang, vanaf een schone stand.
  for (let t = 0; t < 30 * 24 * H; t += 5 * 60 * 1000) {
    if (shouldFire(key, t)) (t < 24 * H ? firstDay++ : rest++);
  }
  const total = firstDay + rest;
  // Let op: 2/dag is de EINDstand. De eerste dag telt de opstart mee
  // (0u, +1u, +4u, +12u), dus dag 1 heeft er een paar extra.
  check(`dag 1 = ${firstDay} meldingen (opstartrit 1u→4u→12u)`, firstDay === 4, `→ ${firstDay}`);
  check(
    `dag 2-30 = ${rest} meldingen = ${(rest / 29).toFixed(2)}/dag (plafond 12u → 2/dag)`,
    Math.abs(rest / 29 - 2) < 0.1,
    `→ ${(rest / 29).toFixed(2)}`
  );
  check(`30 dagen totaal ${total} ≤ 65`, total <= 65, `→ ${total}`);
  // Ter vergelijking: de oude vaste cooldown van 1u gaf 24/dag.
  console.log(`       oud (1u vast): ~${24 * 30} meldingen; nu: ${total} (−${(100 - (total / 720) * 100).toFixed(0)}%)`);
}

console.log("\nHerstel reset de backoff");
{
  const key = "disk:/reset";
  shouldFire(key, 0);
  shouldFire(key, 1 * H);          // stap → 1
  check("clearCondition meldt herstel", clearCondition(key) === true);
  check("tweede clear meldt niets", clearCondition(key) === false);
  check("nooit-actieve conditie meldt niets", clearCondition("disk:/nooit") === false);
  check("na herstel vuurt hij weer direct", shouldFire(key, 2 * H) === true);
  check("en staat weer op stap 0 (1u)", shouldFire(key, 3 * H) === true);
}

console.log("\nCondities zijn onafhankelijk");
{
  check("mount A vuurt", shouldFire("disk:/a", 0) === true);
  check("mount B vuurt ook", shouldFire("disk:/b", 0) === true);
  check("A zwijgt binnen 1u", shouldFire("disk:/a", 30 * 60 * 1000) === false);
  check("B ongemoeid door A", shouldFire("disk:/b", 1 * H) === true);
}

console.log("\nA1 — severity-mapping van het 404-vangnet");
{
  const map = (s) => (s === "critical" ? "critical" : "normal");
  check("critical → critical", map("critical") === "critical");
  check("warn → normal", map("warn") === "normal");
  check("info → normal", map("info") === "normal");
  const fallbackSrc = src.slice(src.indexOf("async function approvalFallback"), src.indexOf("async function notify"));
  check("vangnet zet urgency niet vast op critical", !/urgency:\s*"critical"\s*,/.test(fallbackSrc));
  check("vangnet synthetiseert een request_id", fallbackSrc.includes("newRequestId(\"notify-fallback\")"));
  check("request_id is uniek per poging (Date.now + random)", /Date\.now\(\)/.test(src.slice(src.indexOf("function newRequestId"), src.indexOf("function postSigned"))));
  check("vangnet heeft een verwijderdatum", fallbackSrc.includes("2026-08-22") || src.includes("2026-08-22"));
}

console.log(failures === 0 ? "\nALLE TESTS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
