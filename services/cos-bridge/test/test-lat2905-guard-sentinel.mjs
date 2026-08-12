// LAT-2905 (herstel LAT-5370) — oefent classifyGuardRun()/classifyOauthAlert()
// uit de échte monitor.js.
//
// De vraag die dit bestand beantwoordt is smal: als monitor.js een exit-code en
// wat tekst krijgt, beslist hij dan correct of de bewaker daadwerkelijk sprak?
// Elke fixture hieronder is verbatim uitvoer van een echte run van
// /paperclip/ops/oauth-token-guard.py (of, voor de faalpaden, van de
// interpreter zelf) — niets hier is met de hand geschreven om de assertie te
// laten kloppen.
//
// Regressiegeschiedenis: dit blok bestond in de LAT-2905-deploy en is ergens
// tussen LAT-2802/2909/2925/3210 verdwenen bij de herschrijving van /approval
// naar /notify (LAT-5370). checkOauth() las `info.ExitCode` toen kaal als
// `rc`, zonder de sentinel-regel te valideren — precies de valse "OAuth token
// CRITICAL" van 24/25-07 kon zo weer optreden.
import fs from "node:fs";

process.env.APPROVAL_HMAC_SECRET = "test";

const src = fs.readFileSync(
  new URL("../monitor/monitor.js", import.meta.url),
  "utf8"
);
const harness = `${src}\nexport { classifyGuardRun, classifyOauthAlert };\n`;
const { classifyGuardRun, classifyOauthAlert } = await import(
  "data:text/javascript;base64," + Buffer.from(harness).toString("base64")
);

// --- fixtures: gevangen 2026-07-25 van de LAT-2905-bewaker -------------------
const SENT = (sev, rc) => `guard: oauth-token-guard schema=2 sev=${sev} rc=${rc}`;

const HEALTHY = SENT(0, 0);
const WARN = [
  SENT(1, 10),
  "live      : /tmp/lat2905-fix/warn.json",
  "access    : verloopt 2026-07-25T08:46:18.360000+00:00  (0h19m te gaan)",
  "refresh   : verloopt 2026-08-25T08:26:18.360000+00:00",
  "WAARSCHUWING: nog 0h19m geldig",
  "dubbele grant: geen gevonden (alleen bekende paden; diepe scan draait 1x/dag)",
  "CLI-config : onboarding+oauthAccount aanwezig",
].join("\n");
const EXPIRED = [
  SENT(2, 11),
  "live      : /tmp/lat2905-fix/exp.json",
  "access    : verloopt 2026-07-25T07:26:18.360000+00:00  (-1h00m te gaan)",
  "refresh   : verloopt 2026-08-26T08:26:18.360000+00:00",
  "KRITIEK: access-token is 1h00m verlopen; de eerstvolgende run moet hem verversen en doet dat niet altijd",
  "dubbele grant: geen gevonden (alleen bekende paden; diepe scan draait 1x/dag)",
  "CLI-config : onboarding+oauthAccount aanwezig",
].join("\n");
// De bewaker draaide, keek, en vond geen leesbare grant. Een echte noodsituatie
// — en let op: ook geen `live:`-regel, precies waarom "geen live: regel
// betekent het script is weg" nooit een veilige regel was.
const NO_CREDS = [
  SENT(2, 11),
  "KRITIEK: geen leesbare credentials op /tmp/lat2905-fix/does-not-exist.json",
].join("\n");

// Het incident zelf: container herbouwd op een lege home, script weg. python3
// schrijft dit naar stderr en exit 2 — de oude "token dood"-code van de bewaker.
const SCRIPT_GONE =
  "python3: can't open file '/paperclip/ops/oauth-token-guard.py': [Errno 2] No such file or directory";
// Een bewaker van vóór LAT-2905, nog op schijf: juiste vorm, geen sentinel, oude codes.
const OLD_GUARD = [
  "live      : /root/.claude/.credentials.json",
  "access    : verloopt 2026-07-25T07:26:18+00:00  (-1h00m te gaan)",
  "KRITIEK: access-token is 1h00m verlopen; de eerstvolgende run moet hem verversen en doet dat niet altijd",
].join("\n");

const cases = [
  // --- de bewaker sprak: verdict moet letterlijk worden overgenomen ---------
  { name: "gezond, --quiet (sentinel is de enige uitvoer)", rc: 0, out: HEALTHY, sev: 0 },
  { name: "token verloopt binnenkort", rc: 10, out: WARN, sev: 1 },
  { name: "token verlopen", rc: 11, out: EXPIRED, sev: 2 },
  { name: "geen leesbare credentials — echt KRITIEK, geen infra-fout", rc: 11, out: NO_CREDS, sev: 2 },

  // --- de bewaker sprak niet: mag nooit een tokenverdict worden -------------
  { name: "script weg (HET incident: rc=2 van python3 zelf)", rc: 2, out: SCRIPT_GONE, fault: /no sentinel/ },
  { name: "bewaker crashte met traceback (rc=1)", rc: 1, out: 'Traceback (most recent call last):\n  File "<...>", line 1\nValueError: boom', fault: /no sentinel/ },
  { name: "pre-LAT-2905-bewaker nog geinstalleerd", rc: 2, out: OLD_GUARD, fault: /no sentinel/ },
  { name: "permission denied op het bewaker-bestand", rc: 126, out: "/bin/sh: python3: Permission denied", fault: /no sentinel/ },
  { name: "stub exit 0 in stilte — mag NIET als gezond lezen", rc: 0, out: "", fault: /no sentinel/ },
  { name: "--legacy-exit bereikt de monitor (rc buiten 0/10/11)", rc: 2, out: SENT(2, 2), fault: /outside its own exit space/ },
  { name: "uitvoer afgekapt: sentinel en exec zijn het oneens", rc: 0, out: SENT(2, 11), fault: /lost in transit/ },
  { name: "bewaker nieuwer dan deze monitor (schema-sprong)", rc: 11, out: "guard: oauth-token-guard schema=3 sev=2 rc=11", fault: /schema/ },
  { name: "sentinel innerlijk inconsistent (sev vs rc)", rc: 10, out: SENT(2, 10), fault: /announced sev=2 but exited 10/ },
  { name: "sentinel-achtige tekst midden in een regel is geen sentinel", rc: 2, out: "prev alert said guard: oauth-token-guard schema=2 sev=0 rc=0 earlier", fault: /no sentinel/ },
];

let failures = 0;
for (const c of cases) {
  const got = classifyGuardRun(c.rc, c.out);
  let good;
  if (c.fault !== undefined) {
    good = typeof got.fault === "string" && c.fault.test(got.fault) && got.sev === undefined;
  } else {
    good = got.sev === c.sev && got.fault === undefined;
  }
  if (good) {
    console.log(`  ok   ${c.name}`);
  } else {
    failures++;
    console.log(`  FAIL ${c.name} -> ${JSON.stringify(got)}`);
  }
}

console.log("\nDe alarmtekst moet echt verschillen tussen de twee oorzaken");
const tokenCrit = classifyOauthAlert(2, EXPIRED);
const gone = classifyGuardRun(2, SCRIPT_GONE);
const checks = [
  ["betrouwbaar sev=2 zegt nog steeds 'token CRITICAL'", /OAuth token CRITICAL/.test(tokenCrit.title)],
  ["betrouwbaar sev=2 wijst nog naar re-auth", /Re-authenticate/.test(tokenCrit.remedy)],
  ["een ontbrekend script levert geen titel op (bereikt classifyOauthAlert nooit)", gone.sev === undefined],
  ["de fault noemt de interpreter-fout letterlijk", /can't open file/.test(gone.fault)],
];
for (const [name, good] of checks) {
  if (good) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`);
  }
}

console.log(failures === 0 ? "\nALLE TESTS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
