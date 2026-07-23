// Test A4: afkappen ná escapeHtml, entity-veilig.
// Leest de échte functies uit index.js (geen kopie) en evalueert ze met stubs.
import fs from "node:fs";

const src = fs.readFileSync(
  new URL("../bridge/src/index.js", import.meta.url),
  "utf8"
);

function grab(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a === -1 || b === -1) throw new Error(`niet gevonden: ${startMarker}`);
  return src.slice(a, b);
}

const block =
  grab("const NOTIFY_SEVERITIES", "async function handleNotifyPost");

const harness = `
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
let QUIET = false;
function isQuietHours() { return QUIET; }
const TELEGRAM_MAX_CHARS = 4096;
${block}
export { buildNotifyText, truncateEscaped, TELEGRAM_MAX_CHARS, NOTIFY_PREFIX };
`;

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);
const { buildNotifyText, truncateEscaped, TELEGRAM_MAX_CHARS } = mod;

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

// Een tekst is entity-veilig als er geen '&' in staat zonder afsluitende ';'.
function entitySafe(text) {
  return !/&[a-z]*$/i.test(text) && !/&(?![a-z]+;)/i.test(text);
}

console.log("A4 — budget op de definitieve, geëscapete string");
for (const [name, body] of [
  ["ampersands (escapen groeit 1→5 tekens)", "&".repeat(5000)],
  ["mixed & < >", "a&b<c>d".repeat(1200)],
  ["plain ascii", "x".repeat(9000)],
  ["net onder de limiet", "y".repeat(3000)],
  ["'&' precies op de knip", "z".repeat(4000) + "&".repeat(200)],
]) {
  for (const severity of ["info", "warn", "critical"]) {
    const { text, truncated } = buildNotifyText({
      severity,
      title: "Disk usage: 88% on /host",
      body,
      agent: "DevOps Monitor",
      paused: true,
    });
    check(
      `${name} [${severity}] ≤ ${TELEGRAM_MAX_CHARS}`,
      text.length <= TELEGRAM_MAX_CHARS,
      `→ ${text.length}`
    );
    check(`${name} [${severity}] entity-veilig`, entitySafe(text));
    if (truncated) {
      check(
        `${name} [${severity}] marker aanwezig`,
        text.includes("… (afgekapt)")
      );
    }
  }
}

console.log("\nTitel en afzender zijn ook agent-input");
{
  const { text } = buildNotifyText({
    severity: "critical",
    title: "&".repeat(4000),
    body: "korte body",
    agent: "&".repeat(500),
    paused: false,
  });
  check("reuzentitel + reuze-afzender ≤ limiet", text.length <= TELEGRAM_MAX_CHARS, `→ ${text.length}`);
  check("reuzentitel entity-veilig", entitySafe(text));
  check("body overleeft", text.includes("korte body"));
}

console.log("\nGeen onnodige afkapping");
{
  const { truncated, text } = buildNotifyText({
    severity: "info",
    title: "t",
    body: "korte melding",
    agent: "DevOps Monitor",
    paused: false,
  });
  check("korte melding niet afgekapt", truncated === false);
  check("body integraal", text.includes("korte melding"));
  check("geen marker", !text.includes("afgekapt"));
}

console.log("\ntruncateEscaped knipt niet in een entity");
{
  // '&amp;' is 5 tekens; knip op elke offset binnen die entity.
  for (let b = 1; b <= 12; b++) {
    const out = truncateEscaped("&amp;&amp;&lt;", b);
    check(`budget=${b} entity-veilig ("${out}")`, entitySafe(out));
    check(`budget=${b} binnen budget`, out.length <= b);
  }
}

console.log("\nPauze- en severity-prefix");
{
  const paused = buildNotifyText({ severity: "warn", title: "t", body: "b", agent: "a", paused: true });
  check("⏸ bij pauze", paused.text.includes("⏸"));
  const notPaused = buildNotifyText({ severity: "warn", title: "t", body: "b", agent: "a", paused: false });
  check("geen ⏸ zonder pauze", !notPaused.text.includes("⏸"));
  check("⚠️ bij warn", notPaused.text.includes("⚠️"));
  const crit = buildNotifyText({ severity: "critical", title: "t", body: "b", agent: "a", paused: false });
  check("CRITICAL-prefix", crit.text.includes("🚨 <b>CRITICAL</b>"));
  const info = buildNotifyText({ severity: "info", title: "t", body: "b", agent: "a", paused: false });
  check("ℹ️ bij info", info.text.includes("ℹ️"));
}

console.log(failures === 0 ? "\nALLE TESTS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
