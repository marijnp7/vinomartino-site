#!/usr/bin/env node
/**
 * LAT-4905 / LAT-4804: drop the stale AI-disclosure line from articles/89.
 *
 * The body of /artikelen/ribera-del-duero-tempranillo-hoogte/ ends with
 *
 *     ---
 *     *Beelden bij dit artikel zijn AI-gegenereerd (gpt-image-2).*
 *     *Deze pagina bevat affiliate-links. ...*
 *
 * That first line dates from the AI hero that LAT-4756 removed. LAT-4804 put a
 * real, rights-covered CC BY-ND photo (CRDO Ribera del Duero) on the page, so
 * the sentence is now factually false — and it sits directly under the visible
 * "Foto: CRDO Ribera del Duero, CC BY-ND 2.0" credit, contradicting it.
 *
 * Only the AI line goes. The `---` rule and the affiliate disclosure stay.
 *
 * Idempotent, and deliberately not by sentinel: it matches the literal stored
 * text, asserts exactly one occurrence, and re-reads the row afterwards. A
 * second run finds zero occurrences and exits 0 without writing.
 *
 * Run: /paperclip/scripts/directus-run-internal.sh \
 *        --script directus/scripts/lat4905-remove-stale-ai-disclosure.mjs [-- --dry-run]
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const DRY_RUN = process.argv.includes("--dry-run");
const ARTICLE_ID = 89;
const NEEDLE = "*Beelden bij dit artikel zijn AI-gegenereerd (gpt-image-2).*\n\n";
const AFFILIATE = "*Deze pagina bevat affiliate-links.";

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${method} ${path} :: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const { data: before } = await api("GET", `/items/articles/${ARTICLE_ID}?fields=id,slug,body`);
const body = before.body || "";
const occurrences = body.split(NEEDLE).length - 1;

console.log(`article ${before.id} (${before.slug}) body=${body.length} chars`);
console.log(`AI-disclosure occurrences: ${occurrences}`);

if (occurrences === 0) {
  if (/Beelden bij dit artikel zijn AI-gegenereerd/i.test(body)) {
    console.error("FAIL: the disclosure is present but not in the expected literal form — refusing to guess.");
    process.exit(2);
  }
  console.log("Nothing to do: disclosure already absent.");
  process.exit(0);
}
if (occurrences !== 1) {
  console.error(`FAIL: expected exactly 1 occurrence, found ${occurrences} — refusing to write.`);
  process.exit(2);
}
if (!body.includes(AFFILIATE)) {
  console.error("FAIL: affiliate disclosure not found — body is not in the shape this patch was written for.");
  process.exit(2);
}

const next = body.replace(NEEDLE, "");
console.log(`new length: ${next.length} (removed ${body.length - next.length} chars)`);

if (DRY_RUN) { console.log("--dry-run: not writing."); process.exit(0); }

await api("PATCH", `/items/articles/${ARTICLE_ID}`, { body: next });

// Read back from the API rather than trusting the PATCH response echo.
const { data: after } = await api("GET", `/items/articles/${ARTICLE_ID}?fields=id,slug,body`);
const stillThere = /Beelden bij dit artikel zijn AI-gegenereerd/i.test(after.body || "");
const affiliateKept = (after.body || "").includes(AFFILIATE);
const ruleKept = (after.body || "").includes("\n---\n");

console.log(`readback: disclosure_present=${stillThere} affiliate_kept=${affiliateKept} hr_kept=${ruleKept}`);
if (stillThere || !affiliateKept || !ruleKept) {
  console.error("FAIL: readback does not match the intended end state.");
  process.exit(3);
}
console.log("OK: stale AI-disclosure removed, affiliate disclosure and rule intact.");
