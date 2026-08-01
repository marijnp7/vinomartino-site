#!/usr/bin/env node
/**
 * Migration: create the `landing_pages` collection (LAT-3209).
 *
 * Waarom een eigen collectie
 * --------------------------
 * PROJECT_BRIEF §3.0 is hard: Directus is de enige bron voor tekst-content.
 * De eerste consument is /seizoenskalender (LAT-3209), maar losse
 * landingspagina's zijn een terugkerend patroon (lead magnets, campagnes), dus
 * dit is bewust een collectie met `slug` als PK en niet een singleton.
 *
 * Elk veld is nullable. Dat is geen slordigheid maar het contract uit LAT-3209:
 * een leeg veld rendert *niets* — er is geen fallback-tekst in de template.
 *
 * Formulier-chrome (labels, knoptekst, fineprint, de frequentiebelofte) staat
 * bewust NIET hier: dat leeft al in de `ui_strings`-dictionary
 * (`newsletter.footer.*`, `newsletter.region.*`) en moet daar één bron blijven.
 * Koersnota-besluit 2 (PROJECT_BRIEF v3.3) wijzigt de frequentiebelofte op één
 * plek; een kopie in deze collectie zou dat direct weer laten divergeren.
 *
 * Run (heeft een ADMIN-token nodig — /collections en /fields zijn schema-routes):
 *   /paperclip/scripts/directus-run-internal.sh --admin \
 *     --script directus/scripts/create-landing-pages-collection.mjs
 *
 * Idempotent: bestaande collectie/velden/permissies worden overgeslagen.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required (admin token — schema routes).');
  process.exit(1);
}

const COLLECTION = 'landing_pages';
const MIRROR_SOURCE = 'articles';
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const exists =
    res.status === 409 || /already exists|exists$/i.test(text) || /has to be unique/i.test(text);
  return { ok: res.status >= 200 && res.status < 300, status: res.status, text, exists };
}

function text(field, note, { interface: iface = 'input', width = 'full' } = {}) {
  return {
    field,
    type: 'text',
    meta: { interface: iface, width, note },
    schema: { is_nullable: true },
  };
}

const FIELDS = [
  {
    field: 'slug',
    type: 'string',
    meta: {
      interface: 'input',
      width: 'half',
      note: 'URL-segment, bv. `seizoenskalender`. Tevens PK.',
    },
    schema: { is_primary_key: true, is_nullable: false, has_auto_increment: false },
  },
  {
    field: 'status',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      width: 'half',
      note: 'Alleen `published` wordt door een productie-build gelezen.',
      options: {
        choices: [
          { text: 'Published', value: 'published' },
          { text: 'Draft', value: 'draft' },
          { text: 'Archived', value: 'archived' },
        ],
      },
    },
    // Default `draft`: een nieuwe landingspagina is nooit per ongeluk live.
    schema: { is_nullable: false, default_value: 'draft' },
  },
  text('hero_kicker', 'Kleine bovenregel boven de titel. Leeg = geen kicker.', { width: 'half' }),
  text('hero_heading', 'H1 van de pagina. Leeg = geen H1.', { width: 'half' }),
  text('hero_lede', 'Introparagraaf onder de H1.', { interface: 'input-multiline' }),
  text('value_heading', 'Kop boven de waardepropositie-lijst.', { width: 'half' }),
  {
    field: 'value_items',
    type: 'json',
    meta: {
      interface: 'list',
      width: 'full',
      note: 'Waardepropositie-punten. Array van {title, body}. Leeg = sectie rendert niet.',
      options: {
        template: '{{ title }}',
        fields: [
          { field: 'title', type: 'string', name: 'Titel', meta: { interface: 'input', width: 'full' } },
          {
            field: 'body',
            type: 'text',
            name: 'Tekst',
            meta: { interface: 'input-multiline', width: 'full' },
          },
        ],
      },
    },
    schema: { is_nullable: true },
  },
  text('form_heading', 'Kop direct boven het aanmeldformulier.', { width: 'half' }),
  text('form_success', 'Bevestigingstekst na een geslaagde aanmelding.', {
    interface: 'input-multiline',
  }),
  text('form_error', 'Foutmelding als MailerLite de aanmelding weigert.', {
    interface: 'input-multiline',
  }),
  text('seo_title', '<title> en og:title. Leeg = pagina krijgt geen eigen SEO-titel.', {
    width: 'half',
  }),
  text('seo_description', 'meta description.', { interface: 'input-multiline' }),
];

async function createCollection() {
  process.stdout.write(`  + collection ${COLLECTION} ... `);
  const res = await api('POST', '/collections', {
    collection: COLLECTION,
    meta: {
      icon: 'flag',
      note: "Losstaande landingspagina's (LAT-3209). Elk veld optioneel: leeg = rendert niets.",
      hidden: false,
      singleton: false,
      sort_field: null,
      archive_field: 'status',
      archive_value: 'archived',
      unarchive_value: 'draft',
    },
    schema: {},
    fields: [FIELDS[0]], // alleen de handmatige PK; de rest via /fields
  });
  if (res.exists) {
    console.log('already exists, skipping');
    return;
  }
  if (res.ok) {
    console.log('OK');
    return;
  }
  console.log(`FAIL (${res.status}): ${res.text.slice(0, 300)}`);
  process.exit(1);
}

async function addFields() {
  for (const f of FIELDS.slice(1)) {
    process.stdout.write(`  + ${COLLECTION}.${f.field} ... `);
    const res = await api('POST', `/fields/${COLLECTION}`, f);
    if (res.exists) {
      console.log('exists, skip');
      continue;
    }
    if (res.ok) {
      console.log('OK');
      continue;
    }
    console.log(`FAIL (${res.status}): ${res.text.slice(0, 200)}`);
    process.exit(1);
  }
}

async function mirrorReadPermissions() {
  // Elke read-permissie op `articles` klonen naar landing_pages, zodat het
  // SSG-buildtoken de nieuwe collectie ook kan lezen. Zonder dit 403't de
  // loader op collectie-niveau en faalt de build luid (LAT-1768/LAT-897).
  const res = await api(
    'GET',
    `/permissions?limit=-1&filter[collection][_in]=${MIRROR_SOURCE},${COLLECTION}&filter[action][_eq]=read`,
  );
  if (!res.ok) {
    console.log(`  ! kon permissies niet lezen (${res.status}); zet read-perm handmatig.`);
    return;
  }
  let perms = [];
  try {
    perms = JSON.parse(res.text).data || [];
  } catch {
    perms = [];
  }
  const sourceReads = perms.filter((p) => p.collection === MIRROR_SOURCE);
  if (sourceReads.length === 0) {
    console.log(`  ! geen read-permissies op ${MIRROR_SOURCE} gevonden om te spiegelen.`);
    return;
  }
  const key = (p) => `${p.role ?? 'null'}|${p.policy ?? 'null'}`;
  const already = new Set(perms.filter((p) => p.collection === COLLECTION).map(key));

  for (const p of sourceReads) {
    const label = p.policy || p.role || '(public)';
    if (already.has(key(p))) {
      console.log(`  ↳ read-perm policy=${label} bestaat al, skip`);
      continue;
    }
    process.stdout.write(`  + read-perm clone policy=${label} ... `);
    const clone = { ...p, collection: COLLECTION };
    delete clone.id;
    delete clone.system;
    // `fields` van articles noemt artikel-velden; landing_pages heeft die niet.
    clone.fields = ['*'];
    const cr = await api('POST', '/permissions', clone);
    if (cr.exists) {
      console.log('exists, skip');
      continue;
    }
    console.log(cr.ok ? 'OK' : `FAIL (${cr.status}): ${cr.text.slice(0, 200)}`);
  }
}

async function run() {
  console.log(`\nCreate collection ${COLLECTION} (LAT-3209)`);
  console.log(`Target: ${DIRECTUS_URL}\n`);
  await createCollection();
  await addFields();
  await mirrorReadPermissions();
  console.log('\nDone. Controleer in de Directus UI dat het buildtoken landing_pages kan lezen.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
