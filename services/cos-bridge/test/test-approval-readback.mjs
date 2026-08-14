// LAT-5444: readControlPlaneDecision() moet de beslis-timestamp uit de
// control-plane meekrijgen.
//
// GET /api/approvals/:id serialiseert camelCase. De bridge las `data.decided_at`
// en kreeg dus altijd undefined. Dat is niet cosmetisch:
//
//   - het pre-write pad in de timeout-watcher schrijft dan
//     COALESCE(NULL, NOW()) en stempelt de sweep-tick in plaats van het moment
//     waarop het board besliste;
//   - reconcileStaleTimeouts() doet `if (!resolved || !resolved.decidedAt) continue;`
//     en corrigeerde daardoor structureel NUL rijen -- de hele LAT-5317-pass was
//     inert zolang dit veld verkeerd heette.
//
// Deze test leest de échte functie uit index.js (geen kopie) en voert hem uit met
// een stub-paperclipFetch die de werkelijke API-payload teruggeeft, letterlijk
// overgenomen van GET /api/approvals/022e1ec0-... op 2026-08-14.
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

const block = grab(
  "const CONTROL_PLANE_DECISION",
  "// ---- timeout-watcher:"
);

// De stub geeft exact terug wat de control-plane teruggeeft: camelCase-velden.
// Zou de API ooit naar snake_case overgaan, dan dekt de tweede case dat af.
const harness = `
let NEXT_BODY = null;
let NEXT_OK = true;
async function paperclipFetch(_path, _opts) {
  if (!NEXT_OK) return { ok: false, status: 404, json: async () => null };
  return { ok: true, status: 200, json: async () => NEXT_BODY };
}
function __setResponse(ok, body) { NEXT_OK = ok; NEXT_BODY = body; }
${block}
export { readControlPlaneDecision, __setResponse, CONTROL_PLANE_DECISION };
`;

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);
const { readControlPlaneDecision, __setResponse } = mod;

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

console.log("test-approval-readback (LAT-5444)");

// 1. De echte payload-vorm: camelCase. Dit is de regressie zelf.
__setResponse(true, {
  id: "022e1ec0-4072-48ed-9e40-41130fe21ebb",
  type: "request_board_approval",
  status: "approved",
  decisionNote: "Board-besluit 2026-08-14 (Marijn).",
  decidedAt: "2026-08-14T11:34:08.616Z",
  createdAt: "2026-08-13T00:46:19.270Z",
});
let out = await readControlPlaneDecision("022e1ec0-4072-48ed-9e40-41130fe21ebb");
check("approved -> decision 'approve'", out?.decision === "approve", `kreeg ${out?.decision}`);
check(
  "camelCase decidedAt komt door (LAT-5444)",
  out?.decidedAt === "2026-08-14T11:34:08.616Z",
  `kreeg ${JSON.stringify(out?.decidedAt)} -- zonder dit veld slaat ` +
    `reconcileStaleTimeouts() elke rij over en corrigeert het nul rijen`
);

// 2. rejected mapt op 'reject' (LAT-5318: de eerste fix dekte alleen approved).
__setResponse(true, { status: "rejected", decidedAt: "2026-07-02T20:13:43.219Z" });
out = await readControlPlaneDecision("x");
check("rejected -> decision 'reject'", out?.decision === "reject", `kreeg ${out?.decision}`);
check("rejected draagt ook een decidedAt", out?.decidedAt === "2026-07-02T20:13:43.219Z");

// 3. snake_case blijft werken als fallback.
__setResponse(true, { status: "approved", decided_at: "2026-08-01T00:00:00.000Z" });
out = await readControlPlaneDecision("x");
check("snake_case decided_at blijft als fallback werken",
  out?.decidedAt === "2026-08-01T00:00:00.000Z", `kreeg ${JSON.stringify(out?.decidedAt)}`);

// 4. De doorval-paden: hier hóórt null uit te komen, anders zou de guard het
//    normale timeout-pad blokkeren voor aanvragen die echt onbeantwoord bleven.
__setResponse(true, { status: "pending", decidedAt: null });
check("pending -> null (valt door naar het timeout-pad)",
  (await readControlPlaneDecision("x")) === null);

__setResponse(false, null);
check("404 -> null (valt door naar het timeout-pad)",
  (await readControlPlaneDecision("x")) === null);

// 5. Een beslissing zonder timestamp mag geen crash geven; decidedAt wordt null
//    en de aanroeper mag zelf beslissen wat hij daarmee doet.
__setResponse(true, { status: "approved" });
out = await readControlPlaneDecision("x");
check("approved zonder timestamp -> decidedAt null, geen throw",
  out?.decision === "approve" && out?.decidedAt === null);

console.log(failures ? `\n${failures} FAIL` : "\nalle checks ok");
process.exit(failures ? 1 : 0);
