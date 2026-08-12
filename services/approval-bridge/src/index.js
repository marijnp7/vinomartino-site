// Approval Bridge Sidecar (LAT-62)
// Syncs Paperclip board-approvals with the CoS Telegram bridge.
//
// Direction A: polls Paperclip for pending approvals, POSTs to CoS bridge /approval
// Direction B: receives bridge callbacks, resolves approvals via Paperclip API

import http from "node:http";
import crypto from "node:crypto";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

const {
  PAPERCLIP_API_URL,
  PAPERCLIP_API_KEY,
  PAPERCLIP_COMPANY_ID,
  APPROVAL_BRIDGE_URL = "http://paperclip-cos-bridge-1:3200/approval",
  APPROVAL_HMAC_SECRET = "",
  CALLBACK_PORT = "3201",
  CALLBACK_PUBLIC_URL = "",
  POLL_INTERVAL_MS = "30000",
} = process.env;

if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !PAPERCLIP_COMPANY_ID) {
  log.fatal("PAPERCLIP_API_URL, PAPERCLIP_API_KEY, and PAPERCLIP_COMPANY_ID are required");
  process.exit(1);
}
if (!APPROVAL_HMAC_SECRET) {
  log.fatal("APPROVAL_HMAC_SECRET is required");
  process.exit(1);
}

const callbackBaseUrl =
  CALLBACK_PUBLIC_URL || `http://paperclip-approval-bridge-1:${CALLBACK_PORT}`;

const forwardedApprovals = new Set();

// ---- HMAC ----

function signPayload(payload) {
  return (
    "sha256=" +
    crypto.createHmac("sha256", APPROVAL_HMAC_SECRET).update(payload).digest("hex")
  );
}

function verifyHmac(body, header) {
  if (!header) return false;
  const expected = signPayload(body);
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- Paperclip API helpers ----

async function paperclipFetch(path, opts = {}) {
  const { timeoutMs = 10000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PAPERCLIP_API_URL}${path}`, {
      ...fetchOpts,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
        ...(fetchOpts.headers || {}),
      },
    });
    return res;
  } catch (err) {
    log.warn({ err: err.message, path }, "paperclip API fetch failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAgentName(agentId) {
  if (!agentId) return "unknown-agent";
  const res = await paperclipFetch(`/api/agents/${agentId}`);
  if (!res?.ok) return agentId;
  try {
    const data = await res.json();
    return data.name || data.urlKey || agentId;
  } catch {
    return agentId;
  }
}

// ---- Direction A: Paperclip -> Telegram ----

async function pollPendingApprovals() {
  const res = await paperclipFetch(
    `/api/companies/${PAPERCLIP_COMPANY_ID}/approvals?status=pending`
  );
  if (!res?.ok) {
    log.warn({ status: res?.status }, "failed to poll pending approvals");
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return;
  }
  const approvals = Array.isArray(data) ? data : data.approvals || data.data || [];

  for (const approval of approvals) {
    if (forwardedApprovals.has(approval.id)) continue;
    forwardedApprovals.add(approval.id);
    forwardToBridge(approval).catch((err) =>
      log.error({ err: err.message, approvalId: approval.id }, "forwardToBridge failed")
    );
  }
}

async function forwardToBridge(approval) {
  const agentName = await fetchAgentName(approval.requestedByAgentId);
  const payload = approval.payload || {};

  const bridgePayload = JSON.stringify({
    request_id: approval.id,
    agent: agentName,
    title: payload.title || `Board Approval: ${approval.type}`,
    body:
      (payload.summary || "") +
      (payload.recommendedAction ? `\n\nAanbevolen actie: ${payload.recommendedAction}` : "") +
      (payload.risks?.length
        ? `\n\nRisico's:\n${payload.risks.map((r) => `- ${r}`).join("\n")}`
        : ""),
    urgency: "normal",
    // LAT-3715/LAT-5297 — 45 min (2700s) was hardcoded here, independent of
    // request-approval.sh/.mjs. Marijn approved raising the default clock to
    // 4h (14400s) on LAT-3715 (2026-08-10); this sidecar forwards the majority
    // of board approvals (request_board_approval) and was never updated.
    timeout_seconds: 14400,
    callback_url: `${callbackBaseUrl}/callback`,
  });

  const headers = {
    "Content-Type": "application/json",
    "X-Signature": signPayload(bridgePayload),
  };

  const res = await fetch(APPROVAL_BRIDGE_URL, {
    method: "POST",
    headers,
    body: bridgePayload,
  });

  if (res.ok) {
    const result = await res.json().catch(() => ({}));
    log.info(
      { approvalId: approval.id, actionId: result.action_id, duplicate: result.duplicate },
      "forwarded approval to bridge"
    );
  } else {
    log.error(
      { approvalId: approval.id, status: res.status },
      "bridge rejected approval forward"
    );
  }
}

// ---- Direction B: Telegram -> Paperclip ----

async function handleCallback(body) {
  if (!verifyHmac(body, null)) {
    // header checked in the HTTP handler, this is a secondary guard
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400, body: JSON.stringify({ error: "invalid json" }) };
  }

  const { request_id, decision } = payload;
  if (!request_id || !decision) {
    return {
      status: 400,
      body: JSON.stringify({ error: "missing request_id or decision" }),
    };
  }

  log.info({ request_id, decision }, "received callback from bridge");

  if (decision === "timeout") {
    log.info({ request_id }, "approval timed out in Telegram — no action taken");
    return {
      status: 200,
      body: JSON.stringify({ request_id, status: "timeout_acknowledged" }),
    };
  }

  let endpoint;
  if (decision === "approve") {
    endpoint = `/api/approvals/${request_id}/approve`;
  } else if (decision === "reject") {
    endpoint = `/api/approvals/${request_id}/reject`;
  } else {
    return {
      status: 400,
      body: JSON.stringify({ error: `unknown decision: ${decision}` }),
    };
  }

  const res = await paperclipFetch(endpoint, {
    method: "POST",
    body: JSON.stringify({
      note: `Resolved via Telegram (CoS bridge) at ${payload.responded_at || new Date().toISOString()}`,
    }),
  });

  if (!res) {
    return {
      status: 502,
      body: JSON.stringify({ error: "paperclip API unreachable" }),
    };
  }

  if (res.ok) {
    log.info({ request_id, decision }, "approval resolved in Paperclip");
    return {
      status: 200,
      body: JSON.stringify({ request_id, decision, status: "resolved" }),
    };
  }

  const errText = await res.text().catch(() => "");
  if (res.status === 409 || res.status === 422) {
    log.info({ request_id, decision, status: res.status }, "approval already resolved");
    return {
      status: 200,
      body: JSON.stringify({ request_id, status: "already_resolved" }),
    };
  }

  log.error({ request_id, decision, status: res.status, errText }, "failed to resolve approval");
  return {
    status: 502,
    body: JSON.stringify({ error: `paperclip returned ${res.status}` }),
  };
}

// ---- HTTP server ----

http
  .createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("ok");
    }

    if (req.url === "/callback" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) {
          res.writeHead(413).end(JSON.stringify({ error: "payload too large" }));
          req.destroy();
        }
      });
      req.on("end", async () => {
        const sigHeader = req.headers["x-signature"];
        if (!verifyHmac(body, sigHeader)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "bad or missing signature" }));
        }
        try {
          const result = await handleCallback(body);
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(result.body);
        } catch (err) {
          log.error({ err: err.message }, "callback handler failed");
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "internal error" }));
        }
      });
      return;
    }

    res.writeHead(404).end();
  })
  .listen(Number(CALLBACK_PORT), () =>
    log.info({ port: Number(CALLBACK_PORT) }, "approval-bridge sidecar listening")
  );

// ---- Poll loop ----

const interval = Number(POLL_INTERVAL_MS);
log.info({ intervalMs: interval, bridgeUrl: APPROVAL_BRIDGE_URL }, "starting poll loop");
pollPendingApprovals();
setInterval(pollPendingApprovals, interval);

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
