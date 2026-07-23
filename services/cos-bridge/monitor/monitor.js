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
// owns the credentials; we only schedule it and carry its exit code to a human.
const OAUTH_INTERVAL_MS = 15 * 60 * 1000;
const OAUTH_CONTAINER = process.env.OAUTH_GUARD_CONTAINER || "paperclip-paperclip-1";
const OAUTH_GUARD_PATH = process.env.OAUTH_GUARD_PATH || "/paperclip/ops/oauth-token-guard.py";
// Critical repeats every 2h while it lasts; a warning is less urgent and would
// otherwise fire on every token cycle, so it repeats every 6h.
const OAUTH_COOLDOWN_MS = { 1: 6 * 60 * 60 * 1000, 2: 2 * 60 * 60 * 1000 };
// Three failed checks in a row (~45 min) means the guard itself is blind,
// which is the same blind spot it was built to remove.
const OAUTH_INFRA_FAIL_THRESHOLD = 3;

if (!HMAC_SECRET) {
  console.error("FATAL: APPROVAL_HMAC_SECRET not set");
  process.exit(1);
}

// restartState: Map<name, { count, windowStart, windowCount }>
// Het meldingsritme zit sinds LAT-2802 in conditionState, niet meer in een
// lastAlertAt per container.
const restartState = new Map();
const oauthState = { lastRc: 0, lastAlertAt: 0, infraFails: 0, infraAlerted: false };

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

async function checkOauth() {
  let result;
  try {
    result = await runGuard();
    oauthState.infraFails = 0;
    oauthState.infraAlerted = false;
  } catch (err) {
    oauthState.infraFails += 1;
    console.error(`[oauth guard error] ${err.message} (${oauthState.infraFails} in a row)`);
    if (oauthState.infraFails >= OAUTH_INFRA_FAIL_THRESHOLD && !oauthState.infraAlerted) {
      oauthState.infraAlerted = true;
      await notify({
        title: "OAuth guard cannot run",
        body: `The OAuth token guard failed ${oauthState.infraFails} times in a row on ${OAUTH_CONTAINER}.\n\nLast error: ${err.message}\n\nThe token is now unmonitored. See LAT-2790 and docs/runbook-oauth-reauth.md.`,
        severity: "warn",
      });
    }
    return;
  }

  const { rc, output } = result;
  console.log(`[${new Date().toISOString()}] oauth guard rc=${rc}`);
  const now = Date.now();

  if (rc === 0) {
    if (oauthState.lastRc !== 0) {
      await notify({
        title: "OAuth token healthy again",
        body: `The OAuth token guard is back to exit 0.\n\n${output}`,
        severity: "info",
      });
    }
    oauthState.lastRc = 0;
    oauthState.lastAlertAt = 0;
    return;
  }

  const cooldown = OAUTH_COOLDOWN_MS[rc] || ALERT_COOLDOWN_MS;
  // Escalating (1 → 2) always alerts immediately; a repeat of the same level
  // waits out its cooldown.
  const escalated = rc > oauthState.lastRc;
  if (escalated || now - oauthState.lastAlertAt > cooldown) {
    oauthState.lastAlertAt = now;
    await notify({
      title: rc >= 2 ? "OAuth token CRITICAL — runs will die" : "OAuth token expiring soon",
      body: `Guard exit code ${rc} on ${OAUTH_CONTAINER}.\n\n${output}\n\nRe-authenticate with docs/runbook-oauth-reauth.md. Do not leave a second copy of the grant behind (LAT-2790).`,
      severity: rc >= 2 ? "critical" : "warn",
    });
  }
  oauthState.lastRc = rc;
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
