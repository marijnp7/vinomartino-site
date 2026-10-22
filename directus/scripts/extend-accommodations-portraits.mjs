#!/usr/bin/env node
/** Add the approved accommodation portrait fields without changing card status.
 * Idempotent. Run with a schema-capable Directus token after review.
 */
const base = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_TOKEN;
if (!base || !token) throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN are required');
const dryRun = process.argv.includes('--dry-run');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).data : null;
}

const field = (name, type, note, options = {}) => ({
  field: name,
  type,
  meta: {
    interface: type === 'json' ? 'input-code' : 'input',
    options: type === 'json' ? { language: 'json' } : options,
    special: type === 'json' ? ['cast-json'] : undefined,
    width: 'full',
    note,
  },
  schema: { is_nullable: true },
});
const parentFields = [
  { field: 'portrait_status', type: 'string', meta: {
    interface: 'select-dropdown', width: 'half',
    options: { choices: ['draft', 'in_review', 'published'].map((value) => ({ text: value, value })) },
    note: 'Independent of accommodations.status. Only an editorially complete, licensed NL+EN portrait may be published.',
  }, schema: { default_value: 'draft', is_nullable: false } },
  field('portrait_content', 'json', 'NL editorial portrait content; see docs/accommodation-portraits.md.'),
  field('portrait_gallery', 'json', 'Ordered Directus file UUIDs with credit and source URL; see docs/accommodation-portraits.md.'),
  field('portrait_permission_ref', 'string', 'Evidence reference for use of property images; not editorial endorsement.'),
  field('portrait_review_ref', 'string', 'Independent editorial review issue or decision reference.'),
];
const translationFields = [
  field('portrait_content', 'json', 'Complete EN portrait content with matching gallery UUIDs. No NL fallback.'),
];

for (const [collection, wanted] of [
  ['accommodations', parentFields],
  ['accommodations_translations', translationFields],
]) {
  const existing = new Set((await request('GET', `/fields/${collection}`)).map((item) => item.field));
  for (const spec of wanted) {
    if (existing.has(spec.field)) { console.log(`${collection}.${spec.field}: exists`); continue; }
    if (dryRun) { console.log(`${collection}.${spec.field}: would create`); continue; }
    await request('POST', `/fields/${collection}`, spec);
    console.log(`${collection}.${spec.field}: created`);
  }
}
