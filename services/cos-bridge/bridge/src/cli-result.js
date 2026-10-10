// Parses the JSON envelope of `claude -p --output-format json` (LAT-13059).
//
// The CLI reports model/auth failures *inside* a well-formed envelope:
// `{"type":"result","is_error":true,"result":"Failed to authenticate. API Error: 401 ..."}`.
// Treating `result` as the answer sent that error text to Marijn as if CoS had said it,
// and stored it as an assistant turn in cos.conversations. Any error envelope, empty
// result or unparseable stdout now throws, so the handler's catch shows ❌ and stores nothing.

export class CosModelError extends Error {
  constructor(message, { kind = "model", status = null } = {}) {
    super(message);
    this.name = "CosModelError";
    this.kind = kind; // "auth" | "model" | "parse" | "empty"
    this.status = status;
  }
}

function classify(text) {
  const m = /\b(401|403|429|500|502|503|529)\b/.exec(text);
  const status = m ? Number(m[1]) : null;
  const kind = status === 401 || status === 403 || /authenticat|not logged in|\/login/i.test(text)
    ? "auth" : "model";
  return { kind, status };
}

export function parseCliResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new CosModelError("CoS-model gaf geen geldige JSON terug", { kind: "parse" });
  }
  const text = parsed?.result ?? parsed?.response ?? parsed?.text;
  if (parsed?.is_error === true || (parsed?.subtype && parsed.subtype !== "success")) {
    const detail = typeof text === "string" ? text.slice(0, 200) : String(parsed?.subtype);
    throw new CosModelError(`CoS-model faalde: ${detail}`, classify(detail));
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new CosModelError("CoS-model gaf een leeg antwoord", { kind: "empty" });
  }
  const usage = parsed.usage || {};
  return { text, tokensIn: usage.input_tokens ?? 0, tokensOut: usage.output_tokens ?? 0 };
}

// execFile rejects on a non-zero exit; the CLI still prints its error envelope on stdout.
export function parseCliFailure(err) {
  if (err?.stdout) parseCliResult(err.stdout); // throws CosModelError with the real cause
  throw new CosModelError(`CoS-CLI faalde: ${String(err?.message ?? err).slice(0, 200)}`);
}
