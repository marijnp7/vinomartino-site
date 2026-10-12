// LAT-13059 — resultaatmelding: een via Telegram neergelegde opdracht meldt zich
// terug in hetzelfde topic, als reply op Marijns bronbericht, zodra het issue
// afgerond is. Pure helpers; de watcher zelf staat in index.js.
//
// Bijhouden gebeurt in cos.conversations (role='system'), zonder migratie:
//   dispatch-rij  content = JSON {kind:"dispatch", issue, identifier, chatId, threadId}
//   notified-rij  content = JSON {kind:"result-notified", issue, identifier, status}

export const TERMINAL_STATUSES = new Set(["done", "cancelled"]);

export function dispatchRecord({ issue, identifier, chatId, threadId }) {
  return JSON.stringify({ kind: "dispatch", issue, identifier, chatId, threadId: threadId ?? null });
}

export function notifiedRecord({ issue, identifier, status }) {
  return JSON.stringify({ kind: "result-notified", issue, identifier, status });
}

export function parseRecord(content) {
  try {
    const r = JSON.parse(content);
    return r && typeof r === "object" && typeof r.kind === "string" ? r : null;
  } catch {
    return null;
  }
}

// Laatste inhoudelijke comment van de agent: niet de bridge zelf (board-key,
// geen authorAgentId) en niet leeg. Comments komen newest-first binnen, maar we
// sorteren zelf zodat de volgorde van de API niet uitmaakt.
export function pickResultComment(comments, assigneeAgentId) {
  const list = (Array.isArray(comments) ? comments : [])
    .filter((c) => c && typeof c.body === "string" && c.body.trim() && c.authorAgentId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list.find((c) => c.authorAgentId === assigneeAgentId) ?? list[0] ?? null;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Telegram-HTML. Geen verzonnen voltooiing: de tekst zegt alleen wat de
// issue-status en de comment van de agent zeggen.
export function buildResultText({ issue, comment, agentLabel, uiBaseUrl = "", maxBody = 1500 }) {
  const id = issue.identifier || issue.id;
  const prefix = (id.match(/^[A-Z]+/) || ["LAT"])[0];
  const link = uiBaseUrl
    ? `<a href="${escapeHtml(`${uiBaseUrl.replace(/\/$/, "")}/${prefix}/issues/${id}`)}">${escapeHtml(id)}</a>`
    : escapeHtml(id);
  const head = issue.status === "done"
    ? `✅ ${link} afgerond${agentLabel ? ` door @${escapeHtml(agentLabel)}` : ""}: ${escapeHtml(issue.title || "")}`
    : `⚪ ${link} geannuleerd${agentLabel ? ` (@${escapeHtml(agentLabel)})` : ""}: ${escapeHtml(issue.title || "")}`;
  if (!comment) return `${head}\n\n<i>Geen afsluitende comment van de agent; open het issue voor het resultaat.</i>`;
  let body = comment.body.trim();
  if (body.length > maxBody) body = body.slice(0, maxBody) + "…";
  return `${head}\n\n${escapeHtml(body)}`;
}
