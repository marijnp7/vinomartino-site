import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRoute, findAgentInText, heuristicIntent, makeSeenSet, parseClassifierJson } from "../src/routing.js";

test("opdracht zonder @ met rol in de zin → dispatch naar die rol", () => {
  const r = decideRoute({ text: "Vraag de editor om het Mosel-stuk vandaag af te ronden", intent: "task" });
  assert.equal(r.action, "dispatch");
  assert.equal(r.agent.key, "editor");
});

test("opdracht zonder rol in topic met default → dispatch naar topic-default", () => {
  const def = findAgentInText("@devops x").agent;
  const r = decideRoute({ text: "herstart de backup", intent: "task", topicDefault: def });
  assert.equal(r.action, "dispatch");
  assert.equal(r.agent.key, "devops");
});

test("opdracht zonder rol in 'algemeen' → korte verduidelijking, niet stil CoS-antwoord", () => {
  const r = decideRoute({ text: "schrijf een stuk over Chablis", intent: "task" });
  assert.equal(r.action, "clarify");
});

test("vraag aan agent met @ → geen ticket", () => {
  const r = decideRoute({ text: "@design hoeveel Kaap-beelden hebben we?", intent: "question" });
  assert.equal(r.action, "answer");
  assert.equal(r.agent.key, "design");
});

test("followup 'leg dat bij Design neer' → dispatch met vorige vraag als body", () => {
  const history = [
    { role: "user", content: "We hebben een hero nodig voor Swartland" },
    { role: "assistant", content: "Klopt, er is nog geen eigen beeld." },
  ];
  const r = decideRoute({ text: "Leg dat bij Design neer", intent: "question", history });
  assert.equal(r.action, "dispatch");
  assert.equal(r.agent.key, "design");
  assert.match(r.body, /hero nodig voor Swartland/);
});

test("followup zonder geschiedenis → verduidelijking", () => {
  assert.equal(decideRoute({ text: "geef dat aan marketing", intent: "task", history: [] }).action, "clarify");
});

test("onbekende rol → reject, niets doorgezet", () => {
  const r = decideRoute({ text: "@boekhouder maak de btw-aangifte", intent: "task" });
  assert.equal(r.action, "reject");
  assert.match(r.text, /niets doorgezet/);
});

test("wijnhuis relaties met spatie wordt herkend", () => {
  assert.equal(findAgentInText("stuur dit naar wijnhuis relaties").agent.key, "wijnhuis-relaties");
});

test("gepauzeerde agent → reject", () => {
  const a = findAgentInText("@design x").agent;
  assert.equal(decideRoute({ text: "@design maak een cover", intent: "task", pausedIds: [a.id] }).action, "reject");
});

test("bestaand issue in opdracht → reuseIssue", () => {
  const r = decideRoute({ text: "@devops pak LAT-13064 opnieuw op", intent: "task" });
  assert.equal(r.reuseIssue, "LAT-13064");
});

test("dubbele Telegram-update wordt herkend", () => {
  const s = makeSeenSet(2);
  assert.equal(s.checkAndAdd("1:10"), false);
  assert.equal(s.checkAndAdd("1:10"), true);
});

test("classifier-fout: heuristiek verliest een opdracht niet stil", () => {
  assert.equal(heuristicIntent("Fix de kapotte link op /streken/"), "task");
  assert.equal(heuristicIntent("hoe staat het met de cadans?"), "question");
  assert.equal(parseClassifierJson("geen json"), null);
  assert.deepEqual(parseClassifierJson('{"intent":"write"}'), { intent: "task" });
});

test("antwoord 'devops' op rol-verduidelijking → vorige opdracht alsnog doorgezet", () => {
  const first = decideRoute({ text: "Fix die runs", intent: "task" });
  assert.equal(first.action, "clarify");
  const history = [{ role: "user", content: "Fix die runs" }, { role: "assistant", content: first.text }];
  const r = decideRoute({ text: "Devops", intent: "unclear", history });
  assert.equal(r.action, "dispatch");
  assert.equal(r.agent.key, "devops");
  assert.match(r.body, /Fix die runs/);
  const r2 = decideRoute({ text: "bij de editor graag", intent: "unclear", history });
  assert.equal(r2.agent.key, "editor");
});

test("los rolwoord zonder voorafgaande verduidelijking → geen dispatch", () => {
  const history = [{ role: "user", content: "Hoe gaat het?" }, { role: "assistant", content: "Goed." }];
  const r = decideRoute({ text: "devops", intent: "unclear", history });
  assert.notEqual(r.action, "dispatch");
});
