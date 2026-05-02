// Chief of Staff — Telegram bridge
// Ontvangt Telegram-berichten, whitelist-check op OWNER, routeert per topic,
// respecteert stille uren + stop-woord, roept de CoS-agent aan via `docker exec`,
// en legt alles vast in Postgres (cos.actions).

import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import pg from "pg";
import pino from "pino";
import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const log = pino({ level: process.env.LOG_LEVEL || "info" });

// Systeem-prompt ophalen uit de cos-container bij startup (gemount op /cos/system-prompt.md).
// Wordt bij elke askCos meegegeven met --system-prompt.
let SYSTEM_PROMPT = "Je bent de Chief of Staff van Paperclip. (system-prompt niet geladen — check deploy stap 7)";
async function loadSystemPrompt() {
  try {
    const { stdout } = await exec("docker", [
      "exec",
      "-u", "node",
      (process.env.COS_CONTAINER || "paperclip-cos-1"),
      "cat", "/cos/system-prompt.md",
    ], { maxBuffer: 2 * 1024 * 1024 });
    if (stdout && stdout.length > 200) {
      SYSTEM_PROMPT = stdout;
      log.info({ chars: stdout.length }, "system-prompt loaded");
    }
  } catch (err) {
    log.warn({ err: err.message }, "failed to load system-prompt, using fallback");
  }
}

// ---- env ----
const {
  BOT_TOKEN,
  OWNER_USER_ID,
  GROUP_ID,
  COS_CONTAINER = "paperclip-cos-1",
  COS_WORKDIR = "/cos",
  QUIET_HOURS_START = "22",
  QUIET_HOURS_END = "7",
  DAILY_BUDGET_CENTS = "300",
  DEFAULT_MODEL = "claude-haiku-4-5-20251001",
  STOP_WORD = "stop",
  RESUME_WORD = "ga door",
  PORT = "3200",
  APPROVAL_HMAC_SECRET = "",
  // Paperclip API — needed for run cancellation, issue updates on approval timeout,
  // and mention-based routing (forwardToAgent).
  // PAPERCLIP_API_KEY must be a board-level API key for run cancellation to work;
  // an agent key can update issues but cannot call POST /heartbeat-runs/:id/cancel.
  PAPERCLIP_API_URL = "",
  PAPERCLIP_API_KEY = "",
  // Required for mention-based routing (creates Paperclip issues for target agents).
  PAPERCLIP_COMPANY_ID = "",
  // Optional: associate forwarded issues with a goal.
  PAPERCLIP_GOAL_ID = "",
  // Optional: agent ID override for content-writer slug.
  CONTENT_WRITER_AGENT_ID = "",
  // Anthropic API key for the intent classifier Haiku call.
  ANTHROPIC_API_KEY = "",
} = process.env;

// Maps @<slug> mentions to Paperclip agent IDs.
// When a slug is recognized, the message is forwarded to that agent via the Paperclip API
// instead of being handled by CoS.  'cos' is the sentinel for "use CoS/default routing".
const AGENT_SLUG_MAP = {
  cto:             "ec4249ed-1f61-4600-93f3-325164b8b875",
  devops:          "58a02f82-cba9-425d-9533-1696ff0efe79",
  "content-writer": CONTENT_WRITER_AGENT_ID || "",
  content:         CONTENT_WRITER_AGENT_ID || "",
  cos:             "", // sentinel — no forward, handled by CoS
};

// Maps topic slugs to default agents for messages without an explicit @-mention.
// null means CoS handles the message directly.
const TOPIC_AGENT_MAP = {
  content:  { agentId: "1dfebc3d-6db2-484b-a30d-4786a1777609", slug: "content" },
  infra:    { agentId: "58a02f82-cba9-425d-9533-1696ff0efe79", slug: "devops" },
  planning: { agentId: "ec4249ed-1f61-4600-93f3-325164b8b875", slug: "cto" },
  algemeen: null,
  inbox:    null,
  alerts:   null,
};

// Regex: @<slug> at the very start of a message, followed by at least one space/newline.
const MENTION_RE = /^@([\w][\w-]*)\s+/;

if (!BOT_TOKEN || !OWNER_USER_ID) {
  log.fatal("BOT_TOKEN and OWNER_USER_ID are required");
  process.exit(1);
}

const OWNER_ID = Number(OWNER_USER_ID);
const QSTART = Number(QUIET_HOURS_START);
const QEND = Number(QUIET_HOURS_END);

// ---- postgres ----
const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

async function q(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ---- helpers ----
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeMd(str) {
  return String(str).replace(/([_*`\[])/g, "\\$1");
}

function isQuietHours(now = new Date()) {
  const h = now.getHours(); // TZ komt uit env (Europe/Amsterdam)
  // QSTART=22, QEND=7 → quiet when h>=22 OR h<7
  if (QSTART > QEND) return h >= QSTART || h < QEND;
  return h >= QSTART && h < QEND;
}

async function getPauseState() {
  const [row] = await q("SELECT paused, paused_reason FROM cos.state WHERE id=1");
  return row ?? { paused: false, paused_reason: null };
}

async function setPauseState(paused, reason = null) {
  await q(
    `UPDATE cos.state SET paused=$1, paused_reason=$2, paused_at=CASE WHEN $1 THEN NOW() ELSE NULL END, updated_at=NOW() WHERE id=1`,
    [paused, reason]
  );
}

async function heartbeat() {
  await q(`UPDATE cos.state SET last_heartbeat=NOW() WHERE id=1`);
}

async function ensureTopicRecord(threadId, topicName) {
  if (!threadId || !topicName) return null;
  // Match op naam-deel (emoji's kunnen verschillen)
  const slugMap = {
    algemeen: /algemeen/i,
    content: /content/i,
    inbox: /inbox/i,
    infra: /infra/i,
    planning: /planning/i,
    alerts: /alerts?/i,
  };
  let matchedSlug = null;
  for (const [slug, re] of Object.entries(slugMap)) {
    if (re.test(topicName)) {
      matchedSlug = slug;
      break;
    }
  }
  if (!matchedSlug) return null;
  await q(
    `UPDATE cos.topics SET thread_id=$1, discovered_at=COALESCE(discovered_at, NOW()) WHERE slug=$2 AND (thread_id IS NULL OR thread_id=$1)`,
    [threadId, matchedSlug]
  );
  return matchedSlug;
}

async function resolveTopicSlug(ctx) {
  // 1-op-1 met bot: geen thread → 'algemeen'
  if (!ctx.message?.message_thread_id) return "algemeen";
  const threadId = ctx.message.message_thread_id;
  const [row] = await q(`SELECT slug FROM cos.topics WHERE thread_id=$1`, [threadId]);
  return row?.slug || "algemeen";
}

async function dailyBudgetLeftCents() {
  const [row] = await q(
    `SELECT cost_eur_cents FROM cos.budget WHERE day=CURRENT_DATE`
  );
  const spent = row?.cost_eur_cents ?? 0;
  return Number(DAILY_BUDGET_CENTS) - spent;
}

async function bumpBudget(centsDelta, tokensIn, tokensOut) {
  await q(
    `INSERT INTO cos.budget (day, tokens_in, tokens_out, cost_eur_cents, last_updated)
     VALUES (CURRENT_DATE, $1, $2, $3, NOW())
     ON CONFLICT (day) DO UPDATE SET
        tokens_in = cos.budget.tokens_in + EXCLUDED.tokens_in,
        tokens_out = cos.budget.tokens_out + EXCLUDED.tokens_out,
        cost_eur_cents = cos.budget.cost_eur_cents + EXCLUDED.cost_eur_cents,
        last_updated = NOW()`,
    [tokensIn, tokensOut, centsDelta]
  );
}

// Ringbuffer: lees de laatste `limit` berichten voor dit topic, chronologisch.
async function getHistory(topicSlug, limit = 20) {
  const rows = await q(
    `SELECT role, content FROM cos.conversations
     WHERE topic_slug=$1 ORDER BY created_at DESC LIMIT $2`,
    [topicSlug, limit]
  );
  return rows.reverse(); // oudste eerst
}

// Roept de Claude CLI in de cos-container aan.
async function askCos(prompt, model = DEFAULT_MODEL, topicSlug = "algemeen") {
  const history = await getHistory(topicSlug);

  let historyBlock = "";
  if (history.length > 0) {
    const lines = history.map(h =>
      `[${h.role === "user" ? "Marijn" : "CoS"}]: ${h.content}`
    );
    historyBlock =
      "\n\n--- gespreksgeschiedenis (laatste berichten, oudste eerst) ---\n" +
      lines.join("\n");
  }

  const systemMsg =
    `${SYSTEM_PROMPT}\n\n--- runtime context ---\n` +
    `Huidig topic: '${topicSlug}'. Uitvoer in het Nederlands (tenzij anders gevraagd), max 400 woorden.` +
    historyBlock;

  const args = [
    "exec",
    "-u", "node",
    "-i",
    COS_CONTAINER,
    "claude",
    "-p", prompt,
    "--system-prompt", systemMsg,
    "--model", model,
    "--output-format", "json",
  ];
  log.info({ model, topicSlug, historyLen: history.length, promptPreview: prompt.slice(0, 120) }, "askCos");
  const { stdout } = await exec("docker", args, { maxBuffer: 10 * 1024 * 1024 });
  try {
    const parsed = JSON.parse(stdout);
    const text = parsed.result || parsed.response || parsed.text || stdout;
    const usage = parsed.usage || {};
    return {
      text: typeof text === "string" ? text : JSON.stringify(text),
      tokensIn: usage.input_tokens ?? 0,
      tokensOut: usage.output_tokens ?? 0,
    };
  } catch {
    return { text: stdout, tokensIn: 0, tokensOut: 0 };
  }
}

// ---- mention-based routing ----

// Parses @<slug> at the start of text. Returns { slug, strippedText } if a known slug is found,
// null if the slug is 'cos' (treat as CoS default with mention stripped), or undefined if
// the slug is not in AGENT_SLUG_MAP (mention ignored, full text preserved).
function parseMention(text) {
  const m = text.match(MENTION_RE);
  if (!m) return undefined;
  const slug = m[1].toLowerCase();
  if (!(slug in AGENT_SLUG_MAP)) {
    log.info({ slug }, "@-mention: unrecognized slug, ignoring");
    return undefined; // not our slug — leave text unchanged
  }
  const strippedText = text.slice(m[0].length).trim();
  if (slug === "cos") return { slug: "cos", strippedText }; // CoS explicit, no forward
  return { slug, strippedText };
}

// Resolves which agent should handle a message.
// mentionSlug: raw @-mention slug (including 'cos'), or null when no mention was given.
// Returns { slug, agentId } for a recognised forward target, or null (CoS handles it).
function resolveTargetAgent(topicSlug, mentionSlug) {
  // Explicit @cos → always let CoS handle it, bypassing topic-based routing.
  if (mentionSlug === "cos") return null;
  // Recognised non-cos @mention wins over topic default.
  if (mentionSlug && (mentionSlug in AGENT_SLUG_MAP)) {
    return { slug: mentionSlug, agentId: AGENT_SLUG_MAP[mentionSlug] };
  }
  // No mention (or unrecognised slug) → look up topic default.
  const entry = TOPIC_AGENT_MAP[topicSlug];
  if (entry?.agentId) return entry;
  return null;
}

// Forwards a message to a Paperclip agent by creating a 'todo' issue assigned to them.
// Returns a pseudo-response object compatible with the askCos return shape.
async function forwardToAgent(slug, msgText, topicSlug, agentIdOverride = null) {
  const agentId = agentIdOverride || AGENT_SLUG_MAP[slug];
  if (!agentId) {
    return { text: `⚠️ @${slug} herkend maar geen agent-ID geconfigureerd.`, tokensIn: 0, tokensOut: 0 };
  }
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !PAPERCLIP_COMPANY_ID) {
    return {
      text: `⚠️ Kan niet doorsturen naar @${slug}: PAPERCLIP_API_URL, PAPERCLIP_API_KEY of PAPERCLIP_COMPANY_ID ontbreekt in bridge-config.`,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const title = `@${slug}: ${msgText.slice(0, 80)}${msgText.length > 80 ? "…" : ""}`;
  const description =
    `Bericht van Marijn via Telegram (topic: ${topicSlug}):\n\n${msgText}\n\n` +
    `---\n_Doorgestuurd door CoS-bridge via @${slug}-mention._`;
  const body = {
    title,
    description,
    status: "todo",
    priority: "medium",
    assigneeAgentId: agentId,
    ...(PAPERCLIP_GOAL_ID ? { goalId: PAPERCLIP_GOAL_ID } : {}),
  };

  const res = await paperclipFetch(`/api/companies/${PAPERCLIP_COMPANY_ID}/issues`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res?.ok) {
    const errText = await res?.text().catch(() => "");
    log.error({ slug, agentId, status: res?.status, errText }, "forwardToAgent: create issue failed");
    return { text: `⚠️ Doorsturen naar @${slug} mislukt (HTTP ${res?.status}).`, tokensIn: 0, tokensOut: 0 };
  }

  let issueData;
  try { issueData = await res.json(); } catch { issueData = {}; }
  const identifier = issueData.identifier || issueData.id || "?";
  log.info({ slug, agentId, identifier }, "forwardToAgent: issue created");
  return {
    text: `✉️ Doorgestuurd naar @${slug} — taak [${identifier}](/LAT/issues/${identifier}) aangemaakt. Wordt opgepakt bij de volgende heartbeat.`,
    tokensIn: 0,
    tokensOut: 0,
  };
}

// ---- intent classifier ----

const CLASSIFIER_SYSTEM = `Je classificeert berichten als READ of WRITE.

READ = het antwoord gaat direct terug naar de gebruiker in Telegram.
Voorbeelden READ:
- "wat staat er deze week open?"
- "schrijf een samenvatting van de laatste deploys"
- "hoe staat het met de content pipeline?"
- "leg uit hoe de routing werkt"
- "wat is de status van LAT-89?"

WRITE = er moet een work-item (Issue) aangemaakt worden voor een agent.
Voorbeelden WRITE:
- "schrijf een artikel over Sangiovese-druiven"
- "deploy de nieuwste versie naar productie"
- "fix de broken link op de homepage"
- "plaats een social media post over onze nieuwe wijn"
- "update de SEO-meta voor alle Piemonte-pagina's"

Antwoord ALLEEN met: {"intent":"read"} of {"intent":"write"}
Bij twijfel: {"intent":"read"}`;

// Classifies a Telegram message as 'read' (answer in Telegram via Paperclip API)
// or 'write' (create a work-item issue for the target agent).
// Always falls back to 'read' on error or missing key.
async function classifyIntent(message, topicSlug) {
  if (!ANTHROPIC_API_KEY) {
    log.warn({ topicSlug }, "classifyIntent: ANTHROPIC_API_KEY not set — defaulting to read");
    return { intent: "read" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 32,
        system: CLASSIFIER_SYSTEM,
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!res.ok) {
      log.warn({ status: res.status, topicSlug }, "classifyIntent: API error — defaulting to read");
      return { intent: "read" };
    }
    const data = await res.json();
    const rawText = data.content?.[0]?.text?.trim() ?? '{"intent":"read"}';
    // Strip markdown code fences that some models add despite "answer ONLY with JSON".
    const jsonText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const parsed = JSON.parse(jsonText);
    const intent = parsed.intent === "write" ? "write" : "read";
    log.info({ intent, topicSlug, msgPreview: message.slice(0, 80) }, "classifyIntent");
    return { intent };
  } catch (err) {
    log.warn({ err: err.message, topicSlug }, "classifyIntent: exception — defaulting to read");
    return { intent: "read" };
  }
}

// ---- read flow: Paperclip API query ----

// Returns { type: 'open_tasks'|'search', searchTerm } or null when no read-pattern matched.
function parseReadQuery(text) {
  const lower = text.toLowerCase();

  // Status/search patterns: "status van X", "hoe staat het met X", "wat is de status van X"
  const searchMatch = lower.match(/(?:status van|hoe staat het met|wat is de status van)\s+(.+)/i);
  if (searchMatch) {
    const searchTerm = searchMatch[1].trim();
    if (searchTerm.length > 100) return null; // guard against greedy match
    return { type: "search", searchTerm };
  }

  // Open tasks patterns
  const openRE = /(?:wat staat er.*open|wat staat.*open|welke taken|open.*taken|openstaande taken|te doen|deze week.*open)/i;
  if (openRE.test(lower)) {
    return { type: "open_tasks", searchTerm: null };
  }

  return null; // no pattern matched → caller falls back to askCos
}

// Queries Paperclip API for the target agent's issues and formats a bullet list.
// Returns { text, tokensIn: 0, tokensOut: 0 } on success, or null to fall through to askCos.
async function handleReadQuery(message, targetAgentId, targetSlug, topicSlug) {
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !PAPERCLIP_COMPANY_ID) return null;

  const query = parseReadQuery(message);
  if (!query) return null; // unrecognised pattern — let CoS answer

  let path;
  if (query.type === "search" && query.searchTerm) {
    path = `/api/companies/${PAPERCLIP_COMPANY_ID}/issues?assigneeAgentId=${targetAgentId}&q=${encodeURIComponent(query.searchTerm)}`;
  } else {
    path = `/api/companies/${PAPERCLIP_COMPANY_ID}/issues?assigneeAgentId=${targetAgentId}&status=todo,in_progress,blocked`;
  }

  log.info({ targetSlug, query }, "handleReadQuery: fetching issues");
  const res = await paperclipFetch(path, { timeoutMs: 10_000 });
  if (!res?.ok) {
    log.warn({ status: res?.status, path }, "handleReadQuery: API call failed — falling back to CoS");
    return null;
  }

  let data;
  try { data = await res.json(); } catch { return null; }

  const issues = Array.isArray(data) ? data : (data.issues || data.data || []);
  const total = issues.length;

  if (total === 0) {
    const label = query.type === "search"
      ? `Geen taken gevonden voor @${targetSlug} matching "${query.searchTerm}".`
      : `✅ Geen open taken voor @${targetSlug}.`;
    return { text: label, tokensIn: 0, tokensOut: 0 };
  }

  const shown = issues.slice(0, 5);
  const header = query.type === "search"
    ? `Taken voor @${targetSlug} matching "${query.searchTerm}" (${total}):`
    : `Open taken voor @${targetSlug} (${total}):`;

  const lines = shown.map(issue => {
    const id = issue.identifier || issue.id || "?";
    const title = (issue.title || "").slice(0, 60);
    const status = issue.status || "";
    return `- [${id}] ${escapeMd(title)} (${status})`;
  });
  if (total > 5) lines.push(`_…en nog ${total - 5} meer_`);

  return { text: `${header}\n${lines.join("\n")}`, tokensIn: 0, tokensOut: 0 };
}

// ---- write flow: create Paperclip issue for write-classified messages ----

// Extracts a concise title: first sentence (up to 80 chars) or truncated start.
function extractTitle(text) {
  const firstSentence = text.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length <= 80) return firstSentence;
  return text.slice(0, 80) + (text.length > 80 ? "…" : "");
}

// Creates a Paperclip issue for a write-classified Telegram message, then confirms in Telegram.
// Returns a pseudo-response object compatible with the askCos return shape.
async function handleWriteCommand(message, targetAgentId, targetSlug, topicSlug, telegramMsgId) {
  if (!targetAgentId) {
    return { text: `⚠️ @${targetSlug} herkend maar geen agent-ID geconfigureerd.`, tokensIn: 0, tokensOut: 0 };
  }
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !PAPERCLIP_COMPANY_ID) {
    return {
      text: `⚠️ Kan geen issue aanmaken voor @${targetSlug}: PAPERCLIP_API_URL, PAPERCLIP_API_KEY of PAPERCLIP_COMPANY_ID ontbreekt.`,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const title = extractTitle(message);
  const timestamp = new Date().toISOString();
  const auditFooter =
    `---\nVia Telegram | topic: ${topicSlug} | door: Marijn Petermeijer | ${timestamp}\n` +
    `Bron-bericht: msg_id ${telegramMsgId}`;
  const description = `${message}\n\n${auditFooter}`;

  const body = {
    title,
    assigneeAgentId: targetAgentId,
    status: "todo",
    priority: "medium",
    description,
    ...(PAPERCLIP_GOAL_ID ? { goalId: PAPERCLIP_GOAL_ID } : {}),
  };

  const res = await paperclipFetch(`/api/companies/${PAPERCLIP_COMPANY_ID}/issues`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res?.ok) {
    const errText = await res?.text().catch(() => "");
    log.error({ targetSlug, targetAgentId, status: res?.status, errText }, "handleWriteCommand: create issue failed");
    return {
      text: `⚠️ Issue aanmaken voor @${targetSlug} mislukt (HTTP ${res?.status}).`,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  let issueData;
  try { issueData = await res.json(); } catch { issueData = {}; }
  const identifier = issueData.identifier || issueData.id || "?";
  log.info({ targetSlug, targetAgentId, identifier }, "handleWriteCommand: issue created");
  return {
    text: `Issue aangemaakt: ${identifier} — toegewezen aan @${targetSlug}`,
    tokensIn: 0,
    tokensOut: 0,
  };
}

// ---- bot ----
const bot = new Telegraf(BOT_TOKEN);

// ACL: alleen OWNER_USER_ID mag praten met de bot.
bot.use(async (ctx, next) => {
  const from = ctx.from?.id;
  if (from !== OWNER_ID) {
    log.warn({ from }, "rejected non-owner message");
    return;
  }
  await heartbeat();
  return next();
});

bot.start((ctx) =>
  ctx.reply(
    "Chief of Staff online. Typ *stop* om me te pauzeren, *ga door* om me te hervatten.\n\nTopics die ik herken: 🟢 Algemeen, 📝 Content, 📬 Inbox, 🛠️ Infra, ⏰ Planning, 🚨 Alerts.",
    { parse_mode: "Markdown" }
  )
);

bot.command("status", async (ctx) => {
  const state = await getPauseState();
  const left = await dailyBudgetLeftCents();
  const q1 = await q(`SELECT COUNT(*)::int AS n FROM cos.actions WHERE decision IS NULL`);
  return ctx.reply(
    `Status:\n` +
      `• Pauze: ${state.paused ? "JA — " + (state.paused_reason || "") : "nee"}\n` +
      `• Budget vandaag over: €${(left / 100).toFixed(2)}\n` +
      `• Open voorstellen: ${q1[0].n}\n` +
      `• Stille uren: ${QSTART}:00–${QEND}:00 (alleen alerts)`
  );
});

bot.command("topicinfo", async (ctx) => {
  const threadId = ctx.message?.message_thread_id;
  return ctx.reply(
    `thread_id: ${threadId ?? "(geen — 1-op-1)"}\nchat_id: ${ctx.chat.id}`
  );
});

bot.on(message("text"), async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  // Stop-woord
  if (lower === STOP_WORD.toLowerCase()) {
    await setPauseState(true, "Op verzoek van Marijn");
    return ctx.reply("⏸️  In pauze. Zeg *ga door* wanneer je me weer wil.", {
      parse_mode: "Markdown",
    });
  }
  if (lower === RESUME_WORD.toLowerCase()) {
    await setPauseState(false);
    return ctx.reply("▶️  Weer online.");
  }

  const state = await getPauseState();
  if (state.paused) {
    return ctx.reply("⏸️  Ik sta in pauze. Zeg *ga door* om me te hervatten.", {
      parse_mode: "Markdown",
    });
  }

  // Budget-cap
  const left = await dailyBudgetLeftCents();
  if (left <= 0) {
    return ctx.reply(
      `🚨 Dagelijks budget (€${(Number(DAILY_BUDGET_CENTS) / 100).toFixed(2)}) is op. Zet het hoger in .env of wacht tot middernacht.`
    );
  }

  // Stille-uren-check: alleen gebruikerschecken wordt altijd beantwoord.
  // Push-berichten van de CoS zelf zijn uit tijdens stille uren (dat regelt de CoS-agent in zijn prompt).
  // Marijn mag wel altijd iets vragen.

  // Topic-detectie & -registratie bij eerste bericht in een topic
  const threadId = ctx.message.message_thread_id;
  const topicName = ctx.message.reply_to_message?.forum_topic_created?.name;
  if (threadId && topicName) {
    await ensureTopicRecord(threadId, topicName);
  }
  const topicSlug = await resolveTopicSlug(ctx);

  // @-mention parsing: strip slug, determine routing target.
  const mention = parseMention(text);
  // mention === undefined  → no known slug, use full text + topic/CoS routing
  // mention.slug === 'cos' → explicit CoS mention, strip it, bypass topic routing
  // mention.slug = other   → forward to that agent via Paperclip API
  const msgText = mention ? mention.strippedText : text;
  const rawMentionSlug = mention ? mention.slug : null;
  const targetAgent = resolveTargetAgent(topicSlug, rawMentionSlug);

  // Explicit @<slug> to a non-CoS agent always creates a task (write), bypassing the classifier.
  // This avoids a failure mode where classifier error → default "read" → falls back to CoS,
  // which is confusing when the user explicitly targeted a specific agent.
  const explicitAgentMention = targetAgent && rawMentionSlug && rawMentionSlug !== "cos";

  // Classify intent via Haiku only when routing is topic-based (no explicit @-mention).
  const { intent } = explicitAgentMention
    ? { intent: "write" }
    : await classifyIntent(msgText, topicSlug);

  await ctx.sendChatAction("typing");

  let reply;
  try {
    let res;
    if (intent === "write" && targetAgent) {
      // Write intent with a resolved target agent → create issue via Paperclip API.
      res = await handleWriteCommand(msgText, targetAgent.agentId, targetAgent.slug, topicSlug, ctx.message.message_id);
    } else if (intent === "read" && targetAgent) {
      // Read intent with a target agent → query Paperclip API for their open tasks.
      // Falls back to askCos when no query pattern matched or the API call failed.
      const readRes = await handleReadQuery(msgText, targetAgent.agentId, targetAgent.slug, topicSlug);
      res = readRes ?? await askCos(msgText, DEFAULT_MODEL, topicSlug);
    } else {
      // No target agent (CoS topic) or unrouted write → CoS answers in Telegram.
      res = await askCos(msgText, DEFAULT_MODEL, topicSlug);
    }
    reply = res.text.trim();

    // Only track budget for LLM calls (forwardToAgent has 0 tokens).
    if (res.tokensIn || res.tokensOut) {
      const costCents = Math.round(
        (res.tokensIn / 1000) * 0.08 + (res.tokensOut / 1000) * 0.4
      );
      await bumpBudget(costCents, res.tokensIn, res.tokensOut);
    }

    // Store original text (including any @mention) as the user message for audit trail.
    await q(
      `INSERT INTO cos.conversations (topic_slug, telegram_msg_id, role, content)
       VALUES ($1, $2, 'user', $3), ($1, $2, 'assistant', $4)`,
      [topicSlug, ctx.message.message_id, text, reply]
    );
  } catch (err) {
    log.error({ err }, "message handler failed");
    reply = `❌ Iets ging mis:\n\`${escapeMd(err.message)}\``;
  }

  const trimmed = reply.length > 3800 ? reply.slice(0, 3800) + "\n…" : reply;
  const replyOpts = { reply_parameters: { message_id: ctx.message.message_id } };
  try {
    return await ctx.reply(trimmed, { ...replyOpts, parse_mode: "Markdown" });
  } catch {
    return ctx.reply(trimmed, replyOpts);
  }
});

// Inline-keyboard callbacks (voor approval-flow)
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  const [action, actionId] = data.split(":");
  if (!["approve", "reject", "modify"].includes(action)) {
    return ctx.answerCbQuery("onbekend");
  }
  const idNum = Number(actionId);
  await q(
    `UPDATE cos.actions SET decision=$1, decided_at=NOW() WHERE id=$2`,
    [action, idNum]
  );
  await ctx.answerCbQuery(
    action === "approve" ? "akkoord" : action === "reject" ? "afgewezen" : "graag aanpassing"
  );
  await ctx.editMessageReplyMarkup(undefined);
  await ctx.reply(
    `Besluit vastgelegd: *${action}* op voorstel #${actionId}.`,
    { parse_mode: "Markdown" }
  );

  // Als dit een externe-agent aanvraag was, POST de decision terug.
  const [row] = await q(
    `SELECT callback_url, request_id, requester_agent FROM cos.actions WHERE id=$1`,
    [idNum]
  );
  if (row?.callback_url && row?.request_id) {
    fireCallback(row.callback_url, row.request_id, action).catch((err) =>
      log.error({ err: err.message, actionId: idNum, agent: row.requester_agent }, "callback fire failed")
    );
  }
});

// ---- approval-flow helpers ----
async function fireCallback(url, requestId, decision) {
  const payload = JSON.stringify({
    request_id: requestId,
    decision,
    responded_at: new Date().toISOString(),
  });
  const headers = { "Content-Type": "application/json" };
  if (APPROVAL_HMAC_SECRET) {
    const sig = crypto.createHmac("sha256", APPROVAL_HMAC_SECRET).update(payload).digest("hex");
    headers["X-Signature"] = `sha256=${sig}`;
  }
  const res = await fetch(url, { method: "POST", headers, body: payload });
  log.info({ url, requestId, decision, status: res.status }, "callback fired");
}

function verifyHmac(body, header) {
  if (!APPROVAL_HMAC_SECRET || !header) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", APPROVAL_HMAC_SECRET).update(body).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleApprovalPost(req, body) {
  if (!APPROVAL_HMAC_SECRET) {
    return { status: 503, body: JSON.stringify({ error: "approval endpoint disabled (no HMAC secret set)" }) };
  }
  if (!verifyHmac(body, req.headers["x-signature"])) {
    return { status: 401, body: JSON.stringify({ error: "bad or missing signature" }) };
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400, body: JSON.stringify({ error: "invalid json" }) };
  }
  const {
    request_id,
    agent,
    title,
    body: proposalBody,
    plain_summary = null,
    urgency = "normal",
    timeout_seconds = 3600,
    callback_url = null,
    run_id = null,
    issue_id = null,
  } = payload;
  if (!request_id || !agent || !title || !proposalBody) {
    return {
      status: 400,
      body: JSON.stringify({ error: "missing required fields: request_id, agent, title, body" }),
    };
  }
  if (!["normal", "critical"].includes(urgency)) {
    return { status: 400, body: JSON.stringify({ error: "urgency must be 'normal' or 'critical'" }) };
  }

  // Dedup op request_id
  const [existing] = await q(
    `SELECT id, decision FROM cos.actions WHERE request_id=$1`,
    [request_id]
  );
  if (existing) {
    return {
      status: 200,
      body: JSON.stringify({
        request_id,
        action_id: existing.id,
        status: existing.decision ? "decided" : "pending",
        decision: existing.decision,
        duplicate: true,
      }),
    };
  }

  // Pauze-check (critical mag doorbreken — zie opdracht, "niemand wil zijn VPS in brand zien staan")
  const state = await getPauseState();
  if (state.paused && urgency !== "critical") {
    return {
      status: 423,
      body: JSON.stringify({
        error: "cos paused",
        reason: state.paused_reason,
        hint: "retry with urgency='critical' if echt urgent, of wacht op 'ga door'",
      }),
    };
  }

  // Budget-cap geldt niet voor approval-pushes (geen LLM-call nodig).
  // Stille uren: push gaat gewoon door, Telegram-DND regelt Marijn zelf.

  const [row] = await q(
    `INSERT INTO cos.actions
       (topic_slug, proposal, category, request_id, requester_agent, urgency, callback_url,
        timeout_at, paperclip_run_id, paperclip_issue_id)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' seconds')::interval, $9, $10)
     RETURNING id`,
    [
      "algemeen",
      `${title}\n\n${proposalBody}`,
      "external",
      request_id,
      agent,
      urgency,
      callback_url,
      String(timeout_seconds),
      run_id || null,
      issue_id || null,
    ]
  );
  const actionId = row.id;

  // Stuur Telegram-bericht met inline approve/deny (HTML mode — Markdown v1
  // chokes on unescaped *, _, ` in agent-supplied title/body fields).
  const prefix = urgency === "critical" ? "🚨 <b>CRITICAL</b>\n\n" : "";
  const quiet = isQuietHours() ? "🌙 (stille uren) " : "";
  const plainLine = plain_summary ? `\n💬 <i>${escapeHtml(plain_summary)}</i>\n` : "";
  const text =
    `${prefix}${quiet}<b>${escapeHtml(title)}</b>\n${plainLine}\n` +
    `${escapeHtml(proposalBody)}\n\n` +
    `— aangevraagd door <code>${escapeHtml(agent)}</code>\n` +
    `— id #${actionId} · timeout ${timeout_seconds}s`;

  try {
    await bot.telegram.sendMessage(OWNER_ID, text, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Approve", `approve:${actionId}`),
          Markup.button.callback("❌ Deny", `reject:${actionId}`),
        ],
      ]),
    });
  } catch (err) {
    log.error({ err: err.message, actionId }, "telegram send failed");
    return { status: 502, body: JSON.stringify({ error: "telegram push failed", action_id: actionId }) };
  }

  return {
    status: 202,
    body: JSON.stringify({ request_id, action_id: actionId, status: "pending" }),
  };
}

async function handleApprovalGet(actionId) {
  const [row] = await q(
    `SELECT id, request_id, requester_agent, decision, decided_at, timeout_at, created_at
       FROM cos.actions WHERE id=$1`,
    [actionId]
  );
  if (!row) return { status: 404, body: JSON.stringify({ error: "not found" }) };
  return {
    status: 200,
    body: JSON.stringify({
      action_id: row.id,
      request_id: row.request_id,
      agent: row.requester_agent,
      status: row.decision ? "decided" : "pending",
      decision: row.decision,
      responded_at: row.decided_at,
      timeout_at: row.timeout_at,
      created_at: row.created_at,
    }),
  };
}

// ---- HTTP server: /health + /approval ----
http
  .createServer((req, res) => {
    // /health — liveness
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("ok");
    }

    // POST /approval — nieuwe approval-aanvraag van externe agent
    if (req.url === "/approval" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) {
          res.writeHead(413).end(JSON.stringify({ error: "payload too large" }));
          req.destroy();
        }
      });
      req.on("end", async () => {
        try {
          const result = await handleApprovalPost(req, body);
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(result.body);
        } catch (err) {
          log.error({ err: err.message }, "POST /approval failed");
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "internal error" }));
        }
      });
      return;
    }

    // GET /approval/:id — status opvragen
    const m = req.url && req.url.match(/^\/approval\/(\d+)$/);
    if (m && req.method === "GET") {
      handleApprovalGet(Number(m[1]))
        .then((result) => {
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(result.body);
        })
        .catch((err) => {
          log.error({ err: err.message }, "GET /approval/:id failed");
          res.writeHead(500).end();
        });
      return;
    }

    res.writeHead(404).end();
  })
  .listen(Number(PORT), () => log.info({ port: Number(PORT) }, "http server listening"));

// ---- Paperclip API helpers for timeout termination ----

async function paperclipFetch(path, opts = {}) {
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY) return null;
  const { timeoutMs, ...fetchOpts } = opts;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${PAPERCLIP_API_URL}${path}`, {
      ...fetchOpts,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAPERCLIP_API_KEY}`,
        ...(fetchOpts.headers || {}),
      },
    });
    return res;
  } catch (err) {
    log.warn({ err: err.message, path }, "paperclip API fetch failed");
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Called when an approval times out. Cancels the waiting run and sets the issue to blocked.
async function terminateApprovalTimeout(row) {
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY) {
    log.warn({ id: row.id }, "PAPERCLIP_API_URL/KEY not set — skipping run termination");
    return;
  }

  // 1. Cancel the waiting run (requires board-level API key).
  if (row.paperclip_run_id) {
    const cancelRes = await paperclipFetch(`/api/heartbeat-runs/${row.paperclip_run_id}/cancel`, {
      method: "POST",
      body: "{}",
    });
    if (cancelRes?.ok) {
      log.info({ id: row.id, runId: row.paperclip_run_id }, "run cancelled via Paperclip API");
    } else {
      log.warn(
        { id: row.id, runId: row.paperclip_run_id, status: cancelRes?.status },
        "run cancel failed — ensure PAPERCLIP_API_KEY is a board-level key"
      );
    }
  }

  // 2. Set the issue to 'blocked' so the agent knows to resubmit when ready.
  if (row.paperclip_issue_id) {
    const body = JSON.stringify({
      status: "blocked",
      comment: "Approval timed out after 45 min — resubmit when ready.",
    });
    const issueRes = await paperclipFetch(`/api/issues/${row.paperclip_issue_id}`, {
      method: "PATCH",
      body,
    });
    if (issueRes?.ok) {
      log.info({ id: row.id, issueId: row.paperclip_issue_id }, "issue set to blocked via Paperclip API");
    } else {
      log.warn(
        { id: row.id, issueId: row.paperclip_issue_id, status: issueRes?.status },
        "issue update failed"
      );
    }
  }
}

// ---- timeout-watcher: markeer expired pending requests als 'timeout' + fire callbacks ----
setInterval(async () => {
  try {
    const rows = await q(
      `UPDATE cos.actions
          SET decision='timeout', decided_at=NOW()
        WHERE decision IS NULL
          AND timeout_at IS NOT NULL
          AND timeout_at < NOW()
        RETURNING id, callback_url, request_id, requester_agent,
                  paperclip_run_id, paperclip_issue_id`
    );
    for (const row of rows) {
      log.info({ id: row.id, agent: row.requester_agent }, "approval timed out");
      if (row.callback_url && row.request_id) {
        fireCallback(row.callback_url, row.request_id, "timeout").catch((err) =>
          log.error({ err: err.message, id: row.id }, "timeout callback fire failed")
        );
      }
      // Proactively cancel the run and update the issue.
      terminateApprovalTimeout(row).catch((err) =>
        log.error({ err: err.message, id: row.id }, "terminateApprovalTimeout failed")
      );
    }
  } catch (err) {
    log.error({ err: err.message }, "timeout-watcher sweep failed");
  }
}, 60_000);

// ---- startup ----
(async () => {
  try {
    await pool.query("SELECT 1");
    log.info("postgres ok");
  } catch (err) {
    log.fatal({ err }, "postgres connect failed");
    process.exit(1);
  }
  await loadSystemPrompt();
  await bot.launch();
  log.info("telegram bot launched");
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
