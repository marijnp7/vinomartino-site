#!/usr/bin/env node
// LAT-13809: ledger + dubbele-verzendpreventie voor De Brief (Substack).
// De browserpublisher (Codex, lokaal) draait `check` vóór elke native planning
// en `record` direct erna. Geen private Substack-API: alleen het publieke
// /api/v1/archive wordt gelezen. Geplande/concept-posts staan daar niet in;
// die controleert de publisher zelf in de UI (Posts > Scheduled/Drafts).
//
//   node scripts/de-brief-ledger.mjs check  --title "<titel>" --content-file <md>
//   node scripts/de-brief-ledger.mjs record --issue LAT-2622 --title "<titel>" \
//        --content-file <md> --approval <id> --post-id <substack-id> \
//        --scheduled-at <ISO> [--sent-at <ISO>]
// Exit 0 = veilig, 2 = duplicaat (niets plannen), 1 = gebruiksfout.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LEDGER = fileURLToPath(new URL('../docs/de-brief/ledger.jsonl', import.meta.url));
const ARCHIVE = 'https://vinomartino.substack.com/api/v1/archive?sort=new';

export const norm = (s) =>
  String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
// Substack hangt bij een herhaalde slug "-<n>" aan (gezien: ...-vino-nobile-923 op 02-10).
export const slugBase = (s) => String(s ?? '').replace(/-\d+$/, '');
export const sha256 = (txt) => createHash('sha256').update(String(txt).replace(/\r\n/g, '\n').trim()).digest('hex');

export function readLedger(path = LEDGER) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export async function fetchArchive(fetchImpl = fetch) {
  const out = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await fetchImpl(`${ARCHIVE}&offset=${offset}&limit=50`, { headers: { 'user-agent': 'VinoMartino/1.0' } });
    if (!r.ok) throw new Error(`archive HTTP ${r.status}`); // luid falen: geen archief = geen planning
    const page = await r.json();
    out.push(...page);
    if (page.length < 50) break;
  }
  return out;
}

export function findDuplicates({ title, hash, slug }, ledger, archive) {
  const t = norm(title);
  const hits = [];
  for (const e of ledger) {
    if (e.content_sha256 === hash) hits.push(`ledger: zelfde inhoudshash (${e.issue_id}, post ${e.post_id})`);
    else if (norm(e.title) === t) hits.push(`ledger: zelfde titel (${e.issue_id}, post ${e.post_id})`);
  }
  for (const p of archive) {
    if (norm(p.title) === t) hits.push(`archief: zelfde titel (post ${p.id}, ${p.post_date})`);
    else if (slug && slugBase(p.slug) === slugBase(slug)) hits.push(`archief: zelfde slug-basis (post ${p.id})`);
  }
  return hits;
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
  return o;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (!['check', 'record'].includes(cmd) || !a.title || !a['content-file']) {
    console.error('gebruik: check|record --title <t> --content-file <f> [...]'); process.exit(1);
  }
  const hash = sha256(readFileSync(a['content-file'], 'utf8'));
  const ledger = readLedger();
  if (cmd === 'check') {
    const hits = findDuplicates({ title: a.title, hash, slug: a.slug }, ledger, await fetchArchive());
    console.log(JSON.stringify({ title: a.title, content_sha256: hash, duplicates: hits }));
    process.exit(hits.length ? 2 : 0);
  }
  for (const k of ['issue', 'approval', 'post-id', 'scheduled-at']) {
    if (!a[k]) { console.error(`record mist --${k}`); process.exit(1); }
  }
  const prior = ledger.filter((e) => e.content_sha256 === hash || norm(e.title) === norm(a.title));
  if (prior.length) { console.error(`al in ledger: ${JSON.stringify(prior)}`); process.exit(2); }
  const row = { issue_id: a.issue, post_id: a['post-id'], title: a.title, content_sha256: hash,
    approval_id: a.approval, scheduled_at: a['scheduled-at'], sent_at: a['sent-at'] ?? null,
    recorded_at: new Date().toISOString() };
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
