// LAT-13059: natuurlijke routing voor CoS-chat.
// Pure functies (geen netwerk, geen DB) zodat de beslissing los te testen is.
//
// Vóór deze module: alleen @cto/@devops/@content waren bekend, een @mention was
// altijd een opdracht (ook bij een vraag), een opdracht zonder @ in 'algemeen'
// viel stil terug op een CoS-antwoord, en een classifier-fout werd 'read' zodat
// een opdracht verdween zonder dat iemand het merkte.

// Agentdirectory. Ids zijn de Paperclip agent-ids (stabiel); aliassen zijn wat
// Marijn in gewone taal zegt. `paused` agents worden niet stil gedispatcht.
export const AGENT_DIRECTORY = [
  { key: "cto", id: "fbf962df-5b5d-4b9b-b925-6765a19b2c2e", name: "CTO", aliases: ["cto", "tech", "techniek"] },
  { key: "devops", id: "6cfa8b35-4d7d-4f07-b82e-e65bb81d5895", name: "DevOps Engineer", aliases: ["devops", "ops", "infra"] },
  { key: "design", id: "6d500d26-7b3b-4fb2-b63a-6a0ed885d90d", name: "Design Lead", aliases: ["design", "design-lead", "designer", "beeld"] },
  { key: "marketing", id: "63d6f0ee-d5ea-4da9-b688-7cc41108c762", name: "Marketing & Growth", aliases: ["marketing", "growth", "social"] },
  { key: "editor", id: "fd634565-a9c5-4a40-9ad8-522fa56d53ee", name: "Lead Editor", aliases: ["editor", "lead-editor", "eindredactie", "redactie", "hoofdredactie"] },
  { key: "content", id: "1dfebc3d-6db2-484b-a30d-4786a1777609", name: "Content Writer", aliases: ["content", "content-writer", "writer", "schrijver"] },
  { key: "wijnhuis-relaties", id: "ccaedb7d-d343-4c23-a238-905d8e3d13cd", name: "Wijnhuis Relaties", aliases: ["wijnhuis-relaties", "wijnhuisrelaties", "wijnhuis relaties", "relaties", "outreach"] },
  { key: "seo", id: "5537ba5b-7ce9-44b9-b476-267d2b5a2a9f", name: "SEO Specialist", aliases: ["seo"] },
  { key: "atelier", id: "2faa351d-b49e-47b9-85a0-6f55985b370d", name: "Atelier", aliases: ["atelier"] },
  { key: "strategy", id: "7e5a6e94-9083-4cb1-a4b8-b5f746339168", name: "Strategy", aliases: ["strategy", "strategie"] },
  { key: "inbox", id: "be12f669-3752-48bf-a958-3e1ba24f5afa", name: "Inbox Beheer", aliases: ["inbox", "inbox-beheer"] },
  { key: "ceo", id: "4d8b9fe5-ec6d-4ed2-a120-6da4850a8396", name: "CEO", aliases: ["ceo"] },
  { key: "reisredacteur", id: "1e96722f-754a-49af-bfe4-2a4df0ae148a", name: "Reisredacteur", aliases: ["reisredacteur", "reisredactie"] },
  { key: "sommelier", id: "3a5858a2-a927-4903-88d6-e3cced4673ad", name: "Sommelier-Scout", aliases: ["sommelier", "sommelier-scout"] },
];

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function findAgentByAlias(word) {
  if (!word) return null;
  const w = norm(word).replace(/^@/, "").trim();
  return AGENT_DIRECTORY.find((a) => a.aliases.includes(w)) ?? null;
}

// Zoekt een rol in vrije tekst: "@design ...", "leg dat bij Design neer",
// "vraag de editor ...", "geef het aan wijnhuis relaties".
export function findAgentInText(text) {
  const t = norm(text);
  const at = t.match(/(?:^|\s)@([\w][\w-]*)/);
  if (at) {
    const a = findAgentByAlias(at[1]);
    return a ? { agent: a, explicit: true } : { unknownRole: at[1], explicit: true };
  }
  // Langste alias eerst, zodat "wijnhuis relaties" vóór "relaties" matcht.
  const all = AGENT_DIRECTORY.flatMap((a) => a.aliases.map((al) => [al, a])).sort((x, y) => y[0].length - x[0].length);
  for (const [al, a] of all) {
    const re = new RegExp(`(?:bij|aan|naar|voor|vraag|laat)\\s+(?:de\\s+|het\\s+)?${al.replace(/[-\s]/g, "[-\\s]?")}\\b`);
    if (re.test(t)) return { agent: a, explicit: false };
  }
  return null;
}

// "leg dat bij Design neer", "geef dit aan de editor", "zet het door naar devops"
const FOLLOWUP_RE = /\b(leg|geef|zet|stuur|schuif|zet)\s+(dat|dit|het|die|deze)\b.*\b(bij|aan|naar|door)\b/;
export function isDeicticFollowup(text) {
  return FOLLOWUP_RE.test(norm(text));
}

const LAT_RE = /\bLAT-(\d+)\b/i;
export function referencedIssue(text) {
  const m = text.match(LAT_RE);
  return m ? `LAT-${m[1]}` : null;
}

// Fallback als de classifier faalt: liever een zichtbare verduidelijking dan
// een opdracht die stil als 'vraag' verdwijnt.
const IMPERATIVE_RE = /^(schrijf|maak|fix|herstel|deploy|plaats|publiceer|zet|leg|geef|stuur|update|voeg|verwijder|bouw|regel|zorg|pak|check|controleer)\b/;
export function heuristicIntent(text) {
  const t = norm(text).trim();
  if (/\?\s*$/.test(t)) return "question";
  if (IMPERATIVE_RE.test(t) || isDeicticFollowup(t)) return "task";
  return "unclear";
}

// intent: 'task' | 'question' | 'discuss' | 'unclear'
// Geeft één actie terug:
//   { action: 'dispatch', agent, body, reuseIssue? }
//   { action: 'answer', agent? }          — CoS antwoordt (evt. met agentstatus)
//   { action: 'clarify', text }           — korte, noodzakelijke verduidelijking
//   { action: 'reject', text }            — onbekende rol / gepauzeerde agent
export function decideRoute({ text, intent, topicDefault = null, history = [], pausedIds = [] }) {
  const found = findAgentInText(text);
  if (found?.unknownRole) {
    const known = AGENT_DIRECTORY.map((a) => a.key).join(", ");
    return { action: "reject", text: `Ik ken geen rol '${found.unknownRole}'. Bekend: ${known}. Er is niets doorgezet.` };
  }
  const followup = isDeicticFollowup(text);
  let body = text;
  if (followup) {
    const prevUser = [...history].reverse().find((h) => h.role === "user");
    if (!prevUser) return { action: "clarify", text: "Waar verwijst 'dat' naar? Ik zie geen eerder bericht in dit topic. Er is niets doorgezet." };
    const prevCos = [...history].reverse().find((h) => h.role === "assistant");
    body = `${prevUser.content}\n\n(Doorgezet met: "${text}")` + (prevCos ? `\n\nLaatste CoS-antwoord ter context:\n${prevCos.content.slice(0, 1500)}` : "");
  }
  const effIntent = followup ? "task" : intent;
  const agent = found?.agent ?? (effIntent === "task" ? topicDefault : null);

  if (effIntent === "task") {
    if (!agent) {
      return { action: "clarify", text: "Bij wie moet dit neer? Noem een rol (bijv. design, editor, devops). Er is nog niets doorgezet." };
    }
    if (pausedIds.includes(agent.id)) {
      return { action: "reject", text: `${agent.name} staat op pauze; ik zet hier niets neer. Kies een andere rol.` };
    }
    return { action: "dispatch", agent, body, reuseIssue: referencedIssue(text) };
  }
  if (effIntent === "unclear" && found?.agent) {
    return { action: "clarify", text: `Wil je dat ik dit als opdracht bij ${found.agent.name} neerleg, of is het een vraag? Antwoord met "leg dat bij ${found.agent.key} neer" om door te zetten.` };
  }
  return { action: "answer", agent: found?.agent ?? null };
}

// Idempotentie: Telegram levert bij een webhook-/poll-herstart dezelfde update
// opnieuw. Klein LRU-geheugen in het proces; de DB-check op telegram_msg_id is
// de duurzame tweede laag (zie index.js).
export function makeSeenSet(max = 500) {
  const seen = new Map();
  return {
    checkAndAdd(key) {
      if (seen.has(key)) return true;
      seen.set(key, true);
      if (seen.size > max) seen.delete(seen.keys().next().value);
      return false;
    },
  };
}

export function parseClassifierJson(raw) {
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    const p = JSON.parse(m ? m[0] : raw);
    const intent = ["task", "question", "discuss"].includes(p.intent) ? p.intent
      : p.intent === "write" ? "task" : p.intent === "read" ? "question" : null;
    return intent ? { intent } : null;
  } catch {
    return null;
  }
}
