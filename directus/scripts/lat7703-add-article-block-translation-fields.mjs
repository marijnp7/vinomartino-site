#!/usr/bin/env node
/**
 * LAT-7703 — geef de twee gestructureerde artikel-tekstblokken een vertaalpad.
 *
 * Waarom: `proefnotities` (Uit de kelder) en `eerst_dit_boeken` (Eerst dit
 * boeken) zijn JSON-blobs op `articles` met échte leestekst erin. `mapArticle()`
 * las ze altijd van het NL-basisrecord, óók op /en/, waardoor de i18n-nl-gate
 * NL-zinnen vond op /en/artikelen/epernay-.../ . De code-fix zet ze in
 * ARTICLES_TRANSLATABLE (src/lib/articles.ts); dit script zorgt dat de kolommen
 * op de junction bestaan, want `fetchTranslationOverlay` vraagt ze expliciet op
 * en een ontbrekende kolom geeft een 400 die de hele build breekt.
 *
 * VOLGORDE: dit script MOET vóór de deploy van de code-fix draaien.
 *
 * Idempotent en puur additief — bestaat het veld al, dan blijft het ongemoeid.
 * Spiegelt de `J()`-json-veldfactory uit i18n-translations-schema.mjs (LAT-2602/
 * LAT-2816): mirror het parent-veld 1:1 als nullable `json`, leeg = NL-fallback,
 * dus nooit required.
 *
 * Run (schema-werk, dus ADMIN-token):
 *   /paperclip/scripts/directus-run-internal.sh --admin \
 *     --script directus/scripts/lat7703-add-article-block-translation-fields.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN || process.env.DIRECTUS_TOKEN;
if (!TOKEN) { console.error('ADMIN_TOKEN (or DIRECTUS_TOKEN) is required.'); process.exit(1); }

const JUNCTION = 'articles_translations';
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.ok) return { ok: true, status: res.status, json, text };
  if (res.status === 409 || /already exists|has to be unique|duplicate/i.test(text)) {
    return { ok: true, status: res.status, json, text, exists: true };
  }
  return { ok: false, status: res.status, json, text };
}

const FIELDS = [
  {
    field: 'proefnotities',
    note: 'EN-tegenhanger van articles.proefnotities. Vertaal alleen de tekst-keys (wijnnaam blijft eigennaam, notitie/appellation-omschrijving wel). Leeg = NL.',
  },
  {
    field: 'eerst_dit_boeken',
    note: 'EN-tegenhanger van articles.eerst_dit_boeken. Vertaal `handeling` (en `naam` alleen als het geen eigennaam is). Leeg = NL.',
  },
];

const jsonField = ({ field, note }) => ({
  field,
  type: 'json',
  meta: { interface: 'input-code', options: { language: 'json' }, width: 'full', note },
  schema: { is_nullable: true },
});

async function main() {
  const existing = await api('GET', `/fields/${JUNCTION}`);
  if (!existing.ok) {
    console.error(`FAIL kon velden van ${JUNCTION} niet lezen: ${existing.status} ${existing.text.slice(0, 300)}`);
    process.exit(1);
  }
  const present = new Set((existing.json?.data || []).map((f) => f.field));
  console.log(`${JUNCTION} heeft nu ${present.size} velden: ${[...present].join(', ')}\n`);

  let failed = false;
  for (const spec of FIELDS) {
    if (present.has(spec.field)) {
      console.log(`  SKIP      ${JUNCTION}.${spec.field} (bestaat al)`);
      continue;
    }
    const res = await api('POST', `/fields/${JUNCTION}`, jsonField(spec));
    if (res.ok) {
      console.log(`  ${res.exists ? 'EXISTS' : 'CREATED'}   ${JUNCTION}.${spec.field}`);
    } else {
      failed = true;
      console.error(`  FAIL      ${JUNCTION}.${spec.field}: ${res.status} ${res.text.slice(0, 300)}`);
    }
  }

  // Verifieer tegen de live API, niet tegen onze eigen returnwaarde: pas als
  // /fields ze teruggeeft accepteert fetchTranslationOverlay ze in `fields=`.
  const after = await api('GET', `/fields/${JUNCTION}`);
  const now = new Set((after.json?.data || []).map((f) => f.field));
  const missing = FIELDS.map((f) => f.field).filter((f) => !now.has(f));
  if (missing.length || failed) {
    console.error(`\nNIET COMPLEET — ontbreekt nog: ${missing.join(', ') || '(geen, maar er faalde een call)'}`);
    process.exit(1);
  }

  // Falsifieerbaar: vraag de velden ook echt op zoals de build dat doet.
  const probe = await api('GET', `/items/${JUNCTION}?limit=1&fields=articles_id,proefnotities,eerst_dit_boeken`);
  if (!probe.ok) {
    console.error(`\nVELD BESTAAT MAAR IS NIET OPVRAAGBAAR: ${probe.status} ${probe.text.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`\nOK — beide velden bestaan én zijn opvraagbaar via fields= (build-pad groen).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
