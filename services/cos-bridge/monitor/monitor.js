// paperclip-monitor — threshold checks → cos-bridge notifications
// Checks every 5 minutes:
//   - disk usage on /host > 85% → notify severity=warn (critical vanaf 95%)
//   - container restarts > 3 in 1h → notify severity=critical
// Checks every 15 minutes (LAT-2790):
//   - OAuth-token guard inside paperclip-paperclip-1 → notify severity=critical
//
// LAT-2802: deze checks stelden vroeger approval-vragen (POST /approval) in
// plaats van meldingen te sturen. Niemand hoefde iets te beslissen, dus de
// knoppen deden niets: 163 timeouts, 8 rejects en 5 approves sinds 12-06 waren
// alle drie no-ops. Ze gaan nu via POST /notify, dat geen beslis-machinerie
// heeft. Er is met opzet géén requestApproval() achtergebleven — ongebruikte
// code die approvals kan posten is precies hoe dit terugkomt.
import crypto from "node:crypto";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const BRIDGE_URL = process.env.BRIDGE_URL || "http://paperclip-cos-bridge-1:3200";
const HMAC_SECRET = process.env.APPROVAL_HMAC_SECRET || "";
// LAT-2790: the raw /var/run/docker.sock mount was unusable — this container
// runs as USER node and the socket is root:docker 0660, so every restart check
// since build time died on EACCES. Go through the devops socket-proxy instead:
// same network, EXEC=1 CONTAINERS=1 POST=1, and no root-equivalent socket
// inside a node process.
const DOCKER_API = process.env.DOCKER_PROXY_URL || "http://paperclip-devops-proxy-1:2375";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DISK_THRESHOLD = 85;
const RESTART_THRESHOLD = 3;
const RESTART_WINDOW_MS = 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
// Vanaf hier is een volle schijf geen waarschuwing meer maar een storing.
const DISK_CRITICAL_THRESHOLD = 95;

// --- LAT-2802: meldingsritme per conditie ----------------------------------
// De oude vaste cooldown van 1u was even lang als de approval-timeout, en te
// kort voor een toestand die weken duurt: de schijf staat sinds juni boven de
// drempel en dat leverde tot 24 meldingen per dag op. Met 1u → 4u → 12u is de
// bovengrens 2/dag per conditie en wordt de stílte zelf informatie.
const BACKOFF_STEPS_MS = [1, 4, 12].map((h) => h * 60 * 60 * 1000);

// De backoff-stand is in-memory en reset dus bij elke rebuild van deze
// container. Dat is een bewuste keuze (LAT-2802 §4): het alternatief is de
// suppressie in de bridge doen, en dat verplaatst beleid naar Marijn-gated
// terrein voor winst die hier nul is. Eén extra melding na een rebuild kost
// niets.
// key → { step, lastAlertAt, active }
const conditionState = new Map();

function shouldFire(key, now = Date.now()) {
  const s = conditionState.get(key);
  if (!s || !s.active) {
    conditionState.set(key, { step: 0, lastAlertAt: now, active: true });
    return true;
  }
  const wait = BACKOFF_STEPS_MS[Math.min(s.step, BACKOFF_STEPS_MS.length - 1)];
  if (now - s.lastAlertAt < wait) return false;
  s.step += 1;
  s.lastAlertAt = now;
  return true;
}

// Conditie is terug onder de drempel. Geeft true als er iets te herstellen viel,
// zodat de aanroeper precies één herstelmelding stuurt.
function clearCondition(key) {
  const s = conditionState.get(key);
  if (!s || !s.active) return false;
  conditionState.delete(key);
  return true;
}

// --- LAT-2790: OAuth-token guard -------------------------------------------
// A dead OAuth token silently kills every scheduled run on the primary route
// and does not recover on its own — on 21-07 that lasted ~30h and eight runs
// died within five seconds each. The guard itself lives in the container that
// owns the credentials; we only schedule it and carry its verdict to a human —
// and, since LAT-2905 (restored here after LAT-5370), refuse to invent one
// when the guard did not give us any.
const OAUTH_INTERVAL_MS = 15 * 60 * 1000;
const OAUTH_CONTAINER = process.env.OAUTH_GUARD_CONTAINER || "paperclip-paperclip-1";
const OAUTH_GUARD_PATH = process.env.OAUTH_GUARD_PATH || "/paperclip/ops/oauth-token-guard.py";
// Critical repeats every 2h while it lasts; a warning is less urgent and would
// otherwise fire on every token cycle, so it repeats every 6h.
const OAUTH_COOLDOWN_MS = { 1: 6 * 60 * 60 * 1000, 2: 2 * 60 * 60 * 1000 };
// Three failed checks in a row (~45 min) means the guard itself is blind,
// which is the same blind spot it was built to remove.
const OAUTH_INFRA_FAIL_THRESHOLD = 3;

// LAT-2905 (restored 2026-08-12, LAT-5370): until this existed the guard was
// read by raw exit code, so "python3 exits 2 because the script is gone" and
// "the guard exits 2 because the token is dead" were the same number and this
// file could not tell them apart. On 24-07 20:02Z `paperclip-paperclip-1` was
// recreated on an empty home, the guard went with it, and from 20:16Z to
// 08:16Z — twelve hours — we alerted "OAuth token CRITICAL — runs will die"
// about a token that was in perfect health.
//
// The reading rule that fixes it is not "which exit code came back" but "did
// the guard positively say anything at all". The guard exits in a space the
// interpreter never uses (0/10/11) AND prints a sentinel on every exit path,
// including --quiet and its early aborts. A verdict is accepted only when both
// agree. Everything else — missing script, syntax error, permission denied,
// truncated stream, a guard too old to know about any of this — is the guard
// being unreachable, which is a different alert with a different recovery path
// (runbook §3.1, not §5) and says nothing whatsoever about the token.
//
// REGRESSION HISTORY (LAT-5370): this block existed in the LAT-2905 deploy
// (`ops/backups/monitor.js.LAT-2905-deployed`) and was lost somewhere across
// the LAT-2802/2909/2925/3210 rewrite that moved alerting from POST /approval
// to POST /notify. `checkOauth()` was reading `info.ExitCode` straight off the
// docker exec as `rc` with no sentinel check at all, so the exact false alarm
// LAT-2905 fixed was live again. `node ops/lat2905-monitor-test.mjs` catches
// this: it fails loudly if classifyGuardRun/classifyOauthAlert are missing or
// wrong.
const GUARD_SENTINEL_RE = /^guard: oauth-token-guard schema=(\d+) sev=(\d+) rc=(-?\d+)$/m;
const GUARD_SCHEMA = 2;
// Guard exit code -> severity. Anything not listed here did not come from the
// guard, however plausible it looks.
const GUARD_EXIT_SEV = { 0: 0, 10: 1, 11: 2 };

// LAT-2806: since LAT-2800 the guard raises rc=1 for two unrelated causes — a
// token about to expire, and a damaged CLI config. Re-authenticating does not
// restore a missing ~/.claude.json, so titling both "OAuth token expiring soon"
// sends the reader the wrong way at the worst moment. We branch on the tag the
// guard already puts on its config lines instead of asking it for a fourth exit
// code: severity is ordered (0 < 1 < 2) and this file compares it with `>` for
// escalation and `>= 2` for urgency, so a config-only severity 3 would outrank a
// dead token and land in the CRITICAL branch. Text matching also survives the
// combined case, which a single scalar severity cannot express at all.
// Anchored at line start so the healthy line ("CLI-config : ... aanwezig") and
// the informational decoy line ("LET OP: tweede CLI-config ...") do not match.
const OAUTH_CONFIG_WARN_RE = /^WAARSCHUWING: CLI-config\b/m;
const OAUTH_TOKEN_WARN_RE = /^WAARSCHUWING: nog\b/m;
const OAUTH_REMEDY_TOKEN =
  "Re-authenticate with docs/runbook-oauth-reauth.md. Do not leave a second copy of the grant behind (LAT-2790).";
const OAUTH_REMEDY_CONFIG =
  "Restore the CLI config from `/paperclip/.claude/backups/` — runbook §5.0 (LAT-2800). " +
  "Re-authenticating does NOT fix this: without `hasCompletedOnboarding`/`oauthAccount` an interactive login drops into the onboarding flow first.";

// --- LAT-5356: refresh-as, los van rc ---------------------------------------
// `refreshTokenExpiresAt` schuift niet mee met een gewone token-refresh (zie
// oauth-token-guard.py en runbook §9 -- gemeten 12-08: een rotatie zette de
// access-expiry 7u55m vooruit, de refresh-deadline bleef op dezelfde seconde
// staan). rc/sev hierboven zeggen dus alleen iets over de access-as.
//
// Sinds LAT-5356 drukt de bewaker een TWEEDE, onvoorwaardelijke sentinel af:
//   guard-refresh: oauth-token-guard-refresh schema=1 sev=<0|1|2> code=<0|20|21> days_left=<n> deadline=<iso>
// Dat is bewust geen uitbreiding van GUARD_SENTINEL_RE/GUARD_SCHEMA hierboven
// -- zie de toelichting in oauth-token-guard.py. `code` hieronder is GEEN
// process-exit-code (die blijft uitsluitend `rc`, ongewijzigd) en wordt hier
// ook niet als zodanig gebruikt; alleen `sev` stuurt het alarm.
const REFRESH_SENTINEL_RE =
  /^guard-refresh: oauth-token-guard-refresh schema=(\d+) sev=(\d+) code=(-?\d+) days_left=(\S+) deadline=(\S+)$/m;
const REFRESH_GUARD_SCHEMA = 1;
// Dagenlange conditie, geen minuten -- eens per 12u is genoeg zonder Marijn
// dood te melden. sev 2 (deadline al verstreken) verdient meer aandacht: 4u,
// dezelfde verhouding als OAUTH_COOLDOWN_MS hierboven.
const REFRESH_COOLDOWN_MS = { 1: 12 * 60 * 60 * 1000, 2: 4 * 60 * 60 * 1000 };
const oauthRefreshState = { lastSev: 0, lastAlertAt: 0 };

function classifyRefreshGuard(output) {
  const m = REFRESH_SENTINEL_RE.exec(output);
  if (!m) {
    return { fault: "geen guard-refresh sentinel in de uitvoer (bewaker ouder dan LAT-5356?)" };
  }
  const schema = Number(m[1]);
  if (schema !== REFRESH_GUARD_SCHEMA) {
    return { fault: `guard-refresh spreekt schema ${schema}, deze monitor kent ${REFRESH_GUARD_SCHEMA}` };
  }
  return { sev: Number(m[2]), daysLeft: m[4], deadline: m[5] };
}

async function checkOauthRefresh(output) {
  const verdict = classifyRefreshGuard(output);
  if (verdict.fault) {
    // Geen eigen infra-fail-teller: als de bewaker zelf onbereikbaar is, meldt
    // de access-as dat al (checkOauth's infraFails-pad). Een tweede infra-
    // alarm voor dezelfde oorzaak voegt niets toe.
    console.error(`[oauth refresh axis] ${verdict.fault}`);
    return;
  }

  const { sev, daysLeft, deadline } = verdict;

  if (sev === 0) {
    if (oauthRefreshState.lastSev !== 0) {
      await notify({
        title: "OAuth refresh-token weer gezond",
        body: `De refresh-as is terug op sev=0 (nog ${daysLeft} dagen tot ${deadline}).`,
        severity: "info",
      });
    }
    oauthRefreshState.lastSev = 0;
    oauthRefreshState.lastAlertAt = 0;
    return;
  }

  const cooldown = REFRESH_COOLDOWN_MS[sev] || REFRESH_COOLDOWN_MS[1];
  const escalated = sev > oauthRefreshState.lastSev;
  const now = Date.now();
  if (escalated || now - oauthRefreshState.lastAlertAt > cooldown) {
    oauthRefreshState.lastAlertAt = now;
    await notify({
      title:
        sev >= 2
          ? "OAuth refresh-deadline VERSTREKEN — her-authenticatie nodig"
          : `OAuth refresh-token verloopt over ${daysLeft} dagen`,
      body:
        `Refresh-deadline: ${deadline} (nog ${daysLeft} dagen) op ${OAUTH_CONTAINER}.\n\n` +
        `Dit is de REFRESH-as, niet de access-as: het advies is het TEGENOVERGESTELDE van ` +
        `een gewone "OAuth token expiring soon" op rc=10 — daar is wachten juist goed (de ` +
        `eerstvolgende run ververst hem meestal vanzelf), hier niet. Een gewone refresh ` +
        `zet deze deadline niet vooruit; alleen een interactieve login doet dat.\n\n` +
        `Plan een her-authenticatie: docs/runbook-oauth-reauth.md §5 (Max-account, ` +
        `\`-it\` terminal — dit kan geen agent zelfstandig uitvoeren). Zie LAT-5356.`,
      severity: sev >= 2 ? "critical" : "warn",
    });
  }
  oauthRefreshState.lastSev = sev;
}

if (!HMAC_SECRET) {
  console.error("FATAL: APPROVAL_HMAC_SECRET not set");
  process.exit(1);
}

// restartState: Map<name, { count, windowStart, windowCount }>
// Het meldingsritme zit sinds LAT-2802 in conditionState, niet meer in een
// lastAlertAt per container.
const restartState = new Map();
// lastSev is de eigen severity van de guard (0/1/2), niet zijn exit code — zie
// GUARD_EXIT_SEV. Severity los houden van de wire-code is precies wat de
// exit-space laat verschuiven zonder de escalatie-logica hieronder te raken
// (LAT-2905). configAlerted: is de config-integriteitsoorzaak al gemeld sinds
// de laatste sev=0? De cooldown hieronder is op sev geïndexeerd en een kapotte
// config houdt sev vast op 1, dus zonder dit veld zou een config-storing die
// ná een tokenwaarschuwing binnenkomt tot 6u lang stilzwijgend verdwijnen
// (LAT-2806).
const oauthState = { lastSev: 0, lastAlertAt: 0, infraFails: 0, infraAlerted: false, configAlerted: false };

function hmacSign(bodyStr) {
  return "sha256=" + crypto.createHmac("sha256", HMAC_SECRET).update(bodyStr).digest("hex");
}

function newRequestId(prefix = "monitor") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function postSigned(path, payloadObj, label) {
  const payload = JSON.stringify(payloadObj);
  const sig = hmacSign(payload);

  return new Promise((resolve) => {
    const url = new URL(path, BRIDGE_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": sig,
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.log(`[${label}] status=${res.statusCode} path=${path}`);
        resolve({ status: res.statusCode, data });
      });
    });
    req.on("error", (err) => {
      console.error(`[${label} error] ${err.message}`);
      resolve({ status: 0, error: err.message });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.write(payload);
    req.end();
  });
}

// TIJDELIJK VANGNET — mag weg vanaf 2026-08-22 (30 dagen na deploy, LAT-2802).
//
// Het venster waarvoor dit bedoeld is, is bij constructie leeg: de bridge gaat
// eerst en de monitor daarna, dus de monitor draait nooit met /notify tegen een
// bridge die /notify nog niet kent. Wat dit wél dekt is een rollback van de
// bridge terwijl de nieuwe monitor blijft staan — de enige volgorde waarin een
// melding anders stilletjes in een 404 verdwijnt. Dat is een goede reden om het
// te hebben en een betere reden om het daarna echt te verwijderen.
async function approvalFallback({ title, body, severity }) {
  const payload = {
    // Uniek per poging, niet afgeleid van de conditie: /approval dedupt op
    // request_id, dus een stabiele sleutel zou de tweede terugval als
    // "200 duplicate" afdoen en er zou daarna nooit meer iets uitgaan.
    request_id: newRequestId("notify-fallback"),
    agent: "DevOps Monitor",
    title,
    body,
    // Severity meenemen in plaats van alles op critical zetten. Vast op
    // critical zou van elke schijf-drempel weer een pauze-doorbrekende approval
    // mét knoppen maken — precies het gedrag dat LAT-2802 weghaalt, maar luider.
    urgency: severity === "critical" ? "critical" : "normal",
    timeout_seconds: 3600,
  };
  console.error(
    `[notify fallback] /notify gaf 404 — teruggevallen op /approval ` +
      `(bridge draait een versie zonder /notify) title="${title}"`
  );
  return postSigned("/approval", payload, "approval fallback");
}

async function notify({ title, body, severity = "info" }) {
  const res = await postSigned(
    "/notify",
    { request_id: newRequestId(), agent: "DevOps Monitor", title, body, severity },
    "notify sent"
  );
  if (res.status === 404) return approvalFallback({ title, body, severity });
  return res;
}

async function checkDisk() {
  try {
    const { stdout } = await exec("df", ["-h", "/host"], { timeout: 5000 });
    const lines = stdout.trim().split("\n");
    for (const line of lines.slice(1)) {
      const parts = line.trim().split(/\s+/);
      const usePct = parseInt(parts[4], 10);
      const mountPoint = parts[5];
      if (isNaN(usePct)) continue;
      const key = `disk:${mountPoint}`;

      if (usePct >= DISK_THRESHOLD) {
        if (shouldFire(key)) {
          await notify({
            title: `Disk usage: ${usePct}% on ${mountPoint}`,
            body: `VPS disk usage has reached ${usePct}% (threshold: ${DISK_THRESHOLD}%).\n\n${stdout.trim()}`,
            severity: usePct >= DISK_CRITICAL_THRESHOLD ? "critical" : "warn",
          });
        }
      } else if (clearCondition(key)) {
        // Herstelmelding: de disk-check had er nog geen, de OAuth-check wel.
        // Zonder deze melding is "geen bericht" dubbelzinnig — opgelost of
        // vergeten?
        await notify({
          title: `Disk terug onder drempel: ${usePct}% on ${mountPoint}`,
          body: `VPS disk usage is terug op ${usePct}% (drempel: ${DISK_THRESHOLD}%).\n\n${stdout.trim()}`,
          severity: "info",
        });
      }
    }
  } catch (err) {
    console.error(`[disk check error] ${err.message}`);
  }
}

// --- Docker API over the devops socket-proxy --------------------------------

function dockerRequest(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(path, DOCKER_API);
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (payload !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      }
    );
    req.on("error", (err) => { console.error(`[docker api] ${err.message}`); resolve(null); });
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function dockerGet(path) {
  const res = await dockerRequest("GET", path);
  if (!res) return null;
  try { return JSON.parse(res.buf.toString("utf8")); }
  catch { return null; }
}

// Docker multiplexes exec output into 8-byte-framed chunks when TTY is off.
// Strip the frame headers so the guard's own text reaches the alert body.
function demux(buf) {
  let out = "";
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i + 4);
    out += buf.slice(i + 8, i + 8 + size).toString("utf8");
    i += 8 + size;
  }
  return out || buf.toString("utf8");
}

async function runGuard() {
  const create = await dockerRequest("POST", `/containers/${OAUTH_CONTAINER}/exec`, {
    Cmd: ["python3", OAUTH_GUARD_PATH, "--quiet"],
    AttachStdout: true,
    AttachStderr: true,
  });
  if (!create || create.status !== 201) {
    throw new Error(`exec create failed (status=${create ? create.status : "no response"})`);
  }
  const id = JSON.parse(create.buf.toString("utf8")).Id;
  const started = await dockerRequest("POST", `/exec/${id}/start`, { Detach: false });
  if (!started) throw new Error("exec start failed");
  const info = await dockerGet(`/exec/${id}/json`);
  if (!info || typeof info.ExitCode !== "number") throw new Error("exec inspect returned no exit code");
  return { rc: info.ExitCode, output: demux(started.buf).trim() };
}

// LAT-2905 (restored LAT-5370): decide whether the guard actually delivered a
// verdict. Returns {sev} when it did, or {fault: reason} when it did not.
// Deliberately dumb (rc + raw text in, verdict or reason out) so it can be
// exercised without a container — see ops/lat2905-monitor-test.mjs.
function classifyGuardRun(rc, output) {
  const m = GUARD_SENTINEL_RE.exec(output);
  if (!m) {
    // We attach stderr, so the interpreter's own diagnostic ("can't open file
    // ...") is usually the first line — carry it, it names the real problem.
    const first = (output.split("\n").find((l) => l.trim()) || "(no output at all)").slice(0, 300);
    return { fault: `guard printed no sentinel line, so it never ran (exec exit ${rc}): ${first}` };
  }
  const schema = Number(m[1]);
  const sev = Number(m[2]);
  const announced = Number(m[3]);
  if (schema !== GUARD_SCHEMA) {
    return { fault: `guard speaks sentinel schema ${schema}, this monitor understands ${GUARD_SCHEMA}` };
  }
  if (announced !== rc) {
    return { fault: `guard announced rc=${announced} but exec reported ${rc} — exit code or output was lost in transit` };
  }
  if (GUARD_EXIT_SEV[rc] === undefined) {
    return { fault: `guard exited ${rc}, outside its own exit space (0/10/11)` };
  }
  if (GUARD_EXIT_SEV[rc] !== sev) {
    return { fault: `guard announced sev=${sev} but exited ${rc}` };
  }
  return { sev };
}

// LAT-2806: pick title, remedy and urgency from what the guard actually found.
// Exported shape is deliberately dumb (severity + raw output in, strings out) so
// it can be exercised without a container.
function classifyOauthAlert(sev, output) {
  const config = OAUTH_CONFIG_WARN_RE.test(output);

  // sev >= 2 keeps its title, urgency and remedy exactly as before — an expired
  // token or a duplicated grant is still the headline. Only when the guard also
  // flagged the config do we append the second remedy, because re-authenticating
  // is the documented fix for sev=2 and it cannot work on a broken config.
  if (sev >= 2) {
    return {
      title: "OAuth token CRITICAL — runs will die",
      remedy: config ? `${OAUTH_REMEDY_TOKEN}\n\nAlso: ${OAUTH_REMEDY_CONFIG}` : OAUTH_REMEDY_TOKEN,
      urgency: "critical",
    };
  }

  const token = OAUTH_TOKEN_WARN_RE.test(output);
  if (config && token) {
    return {
      title: "CLI config damaged + OAuth token expiring soon",
      remedy: `${OAUTH_REMEDY_CONFIG}\n\nThen: ${OAUTH_REMEDY_TOKEN}`,
      urgency: "normal",
    };
  }
  if (config) {
    return {
      title: "CLI config integrity failure — emergency re-auth will not work",
      remedy: OAUTH_REMEDY_CONFIG,
      urgency: "normal",
    };
  }
  // No config tag in the output: either a plain token warning, or a guard old
  // enough to predate LAT-2800. Both get the pre-LAT-2806 alert unchanged.
  return {
    title: "OAuth token expiring soon",
    remedy: OAUTH_REMEDY_TOKEN,
    urgency: "normal",
  };
}

async function checkOauth() {
  let result;
  try {
    result = await runGuard();
  } catch (err) {
    // The exec itself never completed — no exit code to reason about at all.
    oauthState.infraFails += 1;
    console.error(`[oauth guard unreachable] ${err.message} (${oauthState.infraFails} in a row)`);
    if (oauthState.infraFails >= OAUTH_INFRA_FAIL_THRESHOLD && !oauthState.infraAlerted) {
      oauthState.infraAlerted = true;
      await notify({
        title: "OAuth-bewaker ONBEREIKBAAR — token staat onbewaakt",
        body:
          `The OAuth guard failed to return a usable verdict ${oauthState.infraFails} times in a row ` +
          `on ${OAUTH_CONTAINER} (${OAUTH_GUARD_PATH}).\n\n` +
          `Reason: ${err.message}\n\n` +
          `**This says nothing about the token.** The instrument is missing, not the credential — ` +
          `do not re-authenticate on the strength of this alert.\n\n` +
          `Recovery path is runbook §3.1 (script/grant loss), NOT §5 (re-auth). See LAT-2790, LAT-2905.`,
        severity: "warn",
      });
    }
    return;
  }

  const { rc, output } = result;
  console.log(`[${new Date().toISOString()}] oauth guard rc=${rc}`);

  // LAT-5356: onafhankelijk van rc/access-as -- loopt ook door als de
  // access-as hieronder een fault of sev>0 oplevert.
  await checkOauthRefresh(output);

  // LAT-2905 (restored LAT-5370): an exit code alone proves nothing — only a
  // verdict that carries the guard's own sentinel is trusted. Before this
  // check existed, rc=2 from a vanished script (python3's own exit) read as a
  // dead token for twelve hours (24/25-07 incident).
  const verdict = classifyGuardRun(rc, output);
  if (verdict.fault) {
    oauthState.infraFails += 1;
    console.error(`[oauth guard unreachable] ${verdict.fault} (${oauthState.infraFails} in a row)`);
    if (oauthState.infraFails >= OAUTH_INFRA_FAIL_THRESHOLD && !oauthState.infraAlerted) {
      oauthState.infraAlerted = true;
      await notify({
        title: "OAuth-bewaker ONBEREIKBAAR — token staat onbewaakt",
        body:
          `The OAuth guard failed to return a usable verdict ${oauthState.infraFails} times in a row ` +
          `on ${OAUTH_CONTAINER} (${OAUTH_GUARD_PATH}).\n\n` +
          `Reason: ${verdict.fault}\n\n` +
          `\`\`\`\n${output.slice(0, 1500)}\n\`\`\`\n\n` +
          `**This says nothing about the token.** The instrument is missing, not the credential — ` +
          `do not re-authenticate on the strength of this alert.\n\n` +
          `Recovery path is runbook §3.1 (script/grant loss), NOT §5 (re-auth). The usual cause is ` +
          `${OAUTH_CONTAINER} being recreated on an empty home, taking /paperclip/ops/ with it ` +
          `(LAT-2795). Check that the guard file exists before anything else. See LAT-2790, LAT-2905.`,
        severity: "warn",
      });
    }
    return;
  }

  const sev = verdict.sev;
  oauthState.infraFails = 0;
  oauthState.infraAlerted = false;
  console.log(`[${new Date().toISOString()}] oauth guard rc=${rc} sev=${sev} (verdict trusted)`);
  const now = Date.now();

  if (sev === 0) {
    if (oauthState.lastSev !== 0) {
      await notify({
        title: "OAuth token healthy again",
        body: `The OAuth token guard is back to exit 0.\n\n${output}`,
        severity: "info",
      });
    }
    oauthState.lastSev = 0;
    oauthState.lastAlertAt = 0;
    oauthState.configAlerted = false;
    return;
  }

  const cooldown = OAUTH_COOLDOWN_MS[sev] || ALERT_COOLDOWN_MS;
  // Escalating (1 → 2) always alerts immediately; a repeat of the same level
  // waits out its cooldown.
  const escalated = sev > oauthState.lastSev;
  // De config-oorzaak is binair en blijft staan tot iemand hem repareert, dus
  // de eerste keer dat hij verschijnt telt ook als escalatie. Met opzet NIET
  // "de titel is veranderd ⇒ meld": bij een permanent kapotte config wisselt de
  // titel mee met de tokencyclus, en die generieke regel zou dan elke cyclus
  // melden -- precies de ruis waar de cooldown tegen beschermt.
  const configNow = OAUTH_CONFIG_WARN_RE.test(output);
  const configNew = configNow && !oauthState.configAlerted;
  if (escalated || configNew || now - oauthState.lastAlertAt > cooldown) {
    oauthState.lastAlertAt = now;
    if (configNow) oauthState.configAlerted = true;
    const { title, remedy, urgency } = classifyOauthAlert(sev, output);
    await notify({
      title,
      body: `Guard severity ${sev} (exit ${rc}) on ${OAUTH_CONTAINER}.\n\n${output}\n\n${remedy}`,
      severity: urgency === "critical" ? "critical" : "warn",
    });
  }
  oauthState.lastSev = sev;
}

async function checkRestarts() {
  const containers = await dockerGet("/containers/json?all=false");
  if (!Array.isArray(containers)) return;

  for (const c of containers) {
    const name = (c.Names?.[0] || "").replace(/^\//, "");
    const details = await dockerGet(`/containers/${c.Id}/json`);
    if (!details) continue;

    const restartCount = details.RestartCount || 0;
    const prev = restartState.get(name);

    if (!prev) {
      restartState.set(name, { count: restartCount, windowStart: Date.now(), windowCount: 0 });
      continue;
    }

    const now = Date.now();
    const key = `restart:${name}`;
    const delta = restartCount - prev.count;

    if (delta > 0) {
      if (now - prev.windowStart > RESTART_WINDOW_MS) {
        prev.windowStart = now;
        prev.windowCount = delta;
      } else {
        prev.windowCount += delta;
      }
      prev.count = restartCount;

      if (prev.windowCount >= RESTART_THRESHOLD && shouldFire(key, now)) {
        await notify({
          title: `Container restarting: ${name} (${prev.windowCount}x in 1h)`,
          body: `Container ${name} has restarted ${prev.windowCount} times in the last hour (total: ${restartCount}). Investigate immediately.`,
          severity: "critical",
        });
      }
    } else if (now - prev.windowStart > RESTART_WINDOW_MS) {
      // Een volledig venster zonder herstart: het venster gaat dicht en, als er
      // een alarm liep, meldt hij één keer dat de container weer stabiel is.
      prev.windowStart = now;
      prev.windowCount = 0;
      if (clearCondition(key)) {
        await notify({
          title: `Container weer stabiel: ${name}`,
          body: `Container ${name} heeft een uur lang niet herstart (totaal: ${restartCount}).`,
          severity: "info",
        });
      }
    }
    restartState.set(name, prev);
  }
}

async function runChecks() {
  console.log(`[${new Date().toISOString()}] running checks`);
  await Promise.allSettled([checkDisk(), checkRestarts()]);
}

// Initial check after 30s startup grace, then every 5min
setTimeout(runChecks, 30_000);
setInterval(runChecks, CHECK_INTERVAL_MS);
// OAuth guard runs on its own 15min cadence (LAT-2790)
setTimeout(checkOauth, 45_000);
setInterval(checkOauth, OAUTH_INTERVAL_MS);
console.log(`paperclip-monitor started — interval=${CHECK_INTERVAL_MS / 1000}s bridge=${BRIDGE_URL} docker=${DOCKER_API} oauth-interval=${OAUTH_INTERVAL_MS / 1000}s`);
