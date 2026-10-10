import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliResult, parseCliFailure, CosModelError } from "../src/cli-result.js";

const authErr = JSON.stringify({ type: "result", subtype: "success", is_error: true,
  result: "Failed to authenticate. API Error: 401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\"}}" });

test("normal answer passes through with usage", () => {
  const r = parseCliResult(JSON.stringify({ type: "result", subtype: "success", is_error: false,
    result: "OK", usage: { input_tokens: 3, output_tokens: 1 } }));
  assert.deepEqual(r, { text: "OK", tokensIn: 3, tokensOut: 1 });
});

test("is_error=true 401 envelope throws auth error, never returned as answer", () => {
  assert.throws(() => parseCliResult(authErr),
    (e) => e instanceof CosModelError && e.kind === "auth" && e.status === 401);
});

test("non-success subtype throws", () => {
  assert.throws(() => parseCliResult(JSON.stringify({ subtype: "error_max_turns", is_error: false })), CosModelError);
});

test("empty result and garbage stdout throw", () => {
  assert.throws(() => parseCliResult(JSON.stringify({ subtype: "success", result: "  " })), { kind: "empty" });
  assert.throws(() => parseCliResult("Failed to authenticate"), { kind: "parse" });
});

test("non-zero exit with error envelope on stdout surfaces the real cause", () => {
  const err = Object.assign(new Error("Command failed: docker exec ..."), { stdout: authErr });
  assert.throws(() => parseCliFailure(err), { kind: "auth" });
  assert.throws(() => parseCliFailure(new Error("spawn docker ENOENT")), CosModelError);
});
