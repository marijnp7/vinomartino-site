#!/usr/bin/env node
/**
 * Migration: Tier 2 illustration hero support (LAT-3253, Route 2).
 *
 * Adds to `articles`:
 *   - hero_is_illustration  boolean, default false, NOT nullable  — signals
 *                           that the hero is a centered illustration (Tier 2)
 *                           rather than photorealistic content (Tier 1).
 *                           When true, renders with `object-fit: contain` and
 *                           a --paper background to preserve full composition.
 *
 * This is deliberately separate from `zelf_gereisd`, which describes
 * story-authenticity, not image type. A redactie-gids article may have a
 * real photograph as hero (no illustration needed).
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-login-token> \
 *       node directus/scripts/add-hero-illustration-field.mjs
 *
 * NB: use an admin LOGIN token (not the static build token). Per LAT-1798 the
 * static ADMIN_TOKEN 403's on /fields; schema writes need an admin session token.
 *
 * Idempotent: 409 / "already exists" on field-create is skipped.
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, text };
  if (res.status === 409 || /already exists/i.test(text) || /Field.*exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

const heroIsIllustrationField = {
  field: "hero_is_illustration",
  type: "boolean",
  meta: {
    interface: "boolean",
    special: ["cast-boolean"],
    width: "half",
    note: "Illustratie-hero (Tier 2, gestileerd beeld) i.p.v. fotorealistisch (Tier 1)? Bepaalt object-fit: contain met --paper achtergrond om volledige compositie zichtbaar te houden (LAT-3253, Route 2).",
    display: "boolean",
    options: { label: "Hero is illustratie (Tier 2)" },
  },
  schema: { default_value: false, is_nullable: false },
};

async function createField() {
  process.stdout.write("  + articles.hero_is_illustration ... ");
  const res = await api("POST", `/fields/articles`, heroIsIllustrationField);
  if (res.alreadyExists) { console.log("already exists, skipping"); return true; }
  if (res.ok) { console.log("OK"); return true; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return false;
}

(async () => {
  const ok = await createField();
  process.exit(ok ? 0 : 1);
})();
