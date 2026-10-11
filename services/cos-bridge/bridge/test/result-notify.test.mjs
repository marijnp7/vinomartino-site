import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchRecord, notifiedRecord, parseRecord, pickResultComment, buildResultText, TERMINAL_STATUSES,
} from "../src/result-notify.js";

test("dispatch- en notified-record zijn round-trip leesbaar", () => {
  const d = parseRecord(dispatchRecord({ issue: "u1", identifier: "LAT-1", chatId: -100, threadId: 7 }));
  assert.deepEqual(d, { kind: "dispatch", issue: "u1", identifier: "LAT-1", chatId: -100, threadId: 7 });
  assert.equal(parseRecord(notifiedRecord({ issue: "u1", identifier: "LAT-1", status: "done" })).kind, "result-notified");
  assert.equal(parseRecord("gewone chattekst"), null);
});

test("alleen done/cancelled zijn eindstatussen; in_review meldt niet", () => {
  assert.ok(TERMINAL_STATUSES.has("done"));
  assert.ok(TERMINAL_STATUSES.has("cancelled"));
  assert.ok(!TERMINAL_STATUSES.has("in_review"));
});

test("pickResultComment kiest nieuwste comment van de assignee, niet de bridge", () => {
  const comments = [
    { body: "bridge-opdracht", authorAgentId: null, createdAt: "2026-10-11T10:00:00Z" },
    { body: "tussenstand", authorAgentId: "A", createdAt: "2026-10-11T11:00:00Z" },
    { body: "resultaat", authorAgentId: "A", createdAt: "2026-10-11T12:00:00Z" },
    { body: "review", authorAgentId: "B", createdAt: "2026-10-11T13:00:00Z" },
  ];
  assert.equal(pickResultComment(comments, "A").body, "resultaat");
  assert.equal(pickResultComment(comments, "Z").body, "review");
  assert.equal(pickResultComment([{ body: "x", authorAgentId: null }], "A"), null);
});

test("buildResultText: link, escaping, geen verzonnen resultaat zonder comment", () => {
  const issue = { identifier: "LAT-9", title: "Hero <Loire>", status: "done" };
  const t = buildResultText({ issue, comment: { body: "Klaar: a<b" }, agentLabel: "design", uiBaseUrl: "https://pc.example/" });
  assert.match(t, /href="https:\/\/pc\.example\/LAT\/issues\/LAT-9"/);
  assert.match(t, /Hero &lt;Loire&gt;/);
  assert.match(t, /Klaar: a&lt;b/);
  const none = buildResultText({ issue, comment: null });
  assert.match(none, /Geen afsluitende comment/);
  assert.doesNotMatch(none, /href/);
  assert.match(buildResultText({ issue: { ...issue, status: "cancelled" }, comment: null }), /geannuleerd/);
});
