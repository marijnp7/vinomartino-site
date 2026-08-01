#!/usr/bin/env node
/**
 * Seed de `landing_pages`-rij voor /seizoenskalender (LAT-3209).
 *
 * De rij wordt aangemaakt op `status: 'draft'`. Dat is de tweede van de drie
 * sluitingen uit LAT-3209: een productie-build leest alleen `published`, dus
 * zelfs met de feature-flag aan levert deze rij geen publieke pagina op.
 * Publiceren = flag aan én deze status op `published` zetten, bewust twee
 * handelingen in twee systemen.
 *
 * De copy hieronder is een startversie. Zodra de rij bestaat is Directus de
 * enige bron: redactie past de tekst daar aan, zonder deploy en zonder dat er
 * een zin in deze repo hoeft te veranderen (PROJECT_BRIEF §3.0).
 *
 * De frequentiebelofte staat hier bewust NIET: die komt uit de ui_strings-key
 * `newsletter.footer.lede` en blijft daarmee gelijk aan homepage en De Brief
 * (koersnota-besluit 2, PROJECT_BRIEF v3.3).
 *
 * Run:
 *   /paperclip/scripts/directus-run-internal.sh --admin \
 *     --script directus/scripts/seed-landing-page-seizoenskalender.mjs
 *
 * Idempotent: een bestaande rij wordt NIET overschreven, tenzij --force.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const COLLECTION = 'landing_pages';
const SLUG = 'seizoenskalender';
const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

const ROW = {
  slug: SLUG,
  status: 'draft',
  hero_kicker: 'Gratis download · seizoenskalender',
  hero_heading: 'De wijnseizoenskalender van VinoMartino',
  hero_lede:
    'Wanneer bloeit de wijnstok, wanneer wordt er geoogst, en wanneer ontvangt een wijnhuis eigenlijk bezoek? De seizoenskalender zet het jaar in de wijngaard maand voor maand op een rij, zodat je je reis plant op het moment dat de streek op zijn mooist is.',
  value_heading: 'Wat er in de kalender staat',
  value_items: [
    {
      title: 'Twaalf maanden, vier streken',
      body: "Piemonte, Toscane, Alsace en de regio's daarbuiten, elk met hun eigen ritme van snoei tot oogst.",
    },
    {
      title: 'Wanneer je het beste boekt',
      body: 'Per maand welke wijnhuizen bezoek ontvangen, wanneer het druk is, en wanneer je de wijnmaker echt aan tafel krijgt.',
    },
    {
      title: 'Wat er dan in het glas zit',
      body: 'Welke wijnen in welk seizoen geschonken worden, en waarom een jonge Nebbiolo in november anders smaakt dan in mei.',
    },
    {
      title: 'Afgestemd op jouw regio',
      body: 'Je regiokeuze bepaalt welke verhalen je daarna van ons krijgt. Kies de streek die je het meest boeit.',
    },
  ],
  form_heading: 'Stuur me de seizoenskalender',
  form_success:
    'Bijna klaar. Check je inbox en bevestig je aanmelding, daarna sturen we de seizoenskalender toe.',
  form_error:
    'Aanmelden lukte even niet. Probeer het zo nog eens, of mail ons op hallo@vinomartino.travel.',
  seo_title: 'Wijnseizoenskalender: het jaar in de wijngaard, maand voor maand',
  seo_description:
    'Plan je wijnreis op het juiste moment. De seizoenskalender van VinoMartino laat per maand zien wat er in de wijngaard gebeurt en wanneer wijnhuizen bezoek ontvangen.',
};

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.status >= 200 && res.status < 300, status: res.status, text };
}

// Harde regel uit PROJECT_BRIEF: geen em-dashes in publieke copy. Deze seed is
// publieke copy, dus de check hoort hier en niet alleen in een reviewersoog.
function assertNoEmDash() {
  const offenders = [];
  const walk = (value, path) => {
    if (typeof value === 'string') {
      if (value.includes('—')) offenders.push(`${path}: ${value.slice(0, 80)}`);
      return;
    }
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (value && typeof value === 'object') {
      return Object.entries(value).forEach(([k, v]) => walk(v, `${path}.${k}`));
    }
  };
  walk(ROW, 'row');
  if (offenders.length) {
    console.error('Em-dash gevonden in publieke copy:\n  ' + offenders.join('\n  '));
    process.exit(1);
  }
}

async function main() {
  assertNoEmDash();
  console.log(`\nSeed ${COLLECTION}/${SLUG} (LAT-3209)`);
  console.log(`Target: ${DIRECTUS_URL}\n`);

  const existing = await api('GET', `/items/${COLLECTION}/${encodeURIComponent(SLUG)}`);
  const found = existing.ok;

  if (found && !FORCE) {
    console.log(`  = rij '${SLUG}' bestaat al — niet overschreven (gebruik --force om dat wel te doen).`);
    console.log('    Directus is nu de bron van waarheid voor deze copy.');
    return;
  }

  if (DRY_RUN) {
    console.log(`  ~ DRY RUN: zou ${found ? 'PATCH' : 'POST'} doen met:`);
    console.log(JSON.stringify(ROW, null, 2));
    return;
  }

  const res = found
    ? await api('PATCH', `/items/${COLLECTION}/${encodeURIComponent(SLUG)}`, ROW)
    : await api('POST', `/items/${COLLECTION}`, ROW);

  if (!res.ok) {
    console.error(`  ! ${found ? 'PATCH' : 'POST'} faalde (${res.status}): ${res.text.slice(0, 400)}`);
    process.exit(1);
  }
  console.log(`  + rij '${SLUG}' ${found ? 'bijgewerkt' : 'aangemaakt'} met status=draft. OK`);
  console.log('\nDone. De pagina blijft onbereikbaar tot status=published EN SEIZOENSKALENDER_ENABLED=1.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
