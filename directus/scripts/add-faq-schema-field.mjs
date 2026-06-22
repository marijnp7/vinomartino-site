#!/usr/bin/env node
/**
 * LAT-1680: FAQPage JSON-LD schema-veld.
 *
 * Voegt idempotent één tekstveld toe op de `articles`-collectie:
 *
 *   articles.faq_schema_json  (text)  — rauwe FAQPage JSON-LD per artikel,
 *                                        SEO/Content Writer input.
 *
 * De Astro loader (src/lib/articles.ts) leest dit veld → article.faqSchema.
 * De template (src/pages/artikelen/[slug].astro) doet JSON.parse en pusht het
 * object in de schema-array. Leeg/null = niets renderen (empty-safe).
 *
 * Idempotent: 409 / "already exists" wordt overgeslagen. Tot dit draait
 * degradeert de loader graceful (tiered fallback) en bouwt de site zonder
 * FAQPage-schema.
 *
 * NB: de articles read-perm policies (content-writer 6b7abca9 + scoped
 * 28dee565) staan op fields:[*], dus dit veld is auto-leesbaar voor de
 * build-rol. Verifieer dat alvorens te concluderen dat er geen allowlist-fix
 * nodig is (zie loader-tier hint).
 *
 * Run (in de directus-container, schema vereist admin LOGIN-token, NIET het
 * restricted static ADMIN_TOKEN):
 *   DIRECTUS_URL=http://localhost:8055 \
 *   DIRECTUS_TOKEN=<admin-login-token> \
 *   node /tmp/add-faq-schema-field.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 200 || res.status === 204) return { ok: true, status: res.status, text };
  if (res.status === 409 || /already exists/i.test(text) || /Field.*exists/i.test(text)) {
    return { ok: true, status: res.status, text, alreadyExists: true };
  }
  return { ok: false, status: res.status, text };
}

async function ensureField(collection, field) {
  process.stdout.write(`  + ${collection}.${field.field} ... `);
  const res = await api('POST', `/fields/${collection}`, field);
  if (res.alreadyExists) { console.log('already exists, skipping'); return 'skipped'; }
  if (res.ok) { console.log('OK'); return 'created'; }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
  return 'error';
}

const faqSchemaField = {
  field: 'faq_schema_json',
  type: 'text',
  meta: {
    interface: 'input-code',
    options: { language: 'JSON' },
    width: 'full',
    note: 'Optionele FAQPage JSON-LD (volledig schema.org FAQPage-object). Wordt 1:1 in de <script type="application/ld+json"> van het artikel gezet. Leeg = geen FAQPage-schema. (LAT-1680)',
  },
  schema: { is_nullable: true },
};

async function run() {
  console.log(`\nLAT-1680 migration: FAQPage JSON-LD veld → ${DIRECTUS_URL}\n`);
  const summary = {};
  summary['articles.faq_schema_json'] = await ensureField('articles', faqSchemaField);
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
  if (Object.values(summary).includes('error')) process.exit(1);
  console.log('\nNB: verifieer build-rol read-permissie op articles.faq_schema_json (policies fields:[*] dekken dit normaal automatisch).');
}

run().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
