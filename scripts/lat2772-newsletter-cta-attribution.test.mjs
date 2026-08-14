// scripts/lat2772-newsletter-cta-attribution.test.mjs — LAT-2772
//
// Waarom deze test bestaat.
//
// `data-plausible-cta` op een submit-knop was **inert**. Het attribuut wordt
// alleen gelezen door de klik-delegatie in `src/lib/plausible.ts`, en die matcht
// uitsluitend `a[href]` — een `<button type="submit">` valt daar per definitie
// buiten. Alle nieuwsbriefformulieren (home, footer, /de-brief/, langhe-PDF,
// seizoenskalender) vuurden daardoor via `newsletter-signup.ts` één
// ononderscheidbare `newsletter_signup`, en het label op de knop kwam nergens
// aan. Dat is precies het soort "de hook staat er dus het werkt"-aanname waar
// LAT-2772 al een keer op is stukgelopen.
//
// De test dekt de twee helften die samen de attributie dragen:
//   1. de knop draagt een label       (anders is er niets om mee te geven)
//   2. de submit-handler leest dat label en zet het in de event-props
//      (anders draagt het label niets over)
//
// Eén helft groen is niet genoeg — vandaar twee losse asserts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Alle .astro-bestanden onder src/, recursief. */
function astroFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...astroFiles(full));
    else if (entry.endsWith('.astro')) out.push(full);
  }
  return out;
}

/**
 * Knip elk `[data-newsletter-signup]`-formulier uit de bron: vanaf het attribuut
 * tot de eerstvolgende `</form>`. Buiten dat venster kijken we niet — een
 * zoekknop elders op de pagina hoort geen signup-label te dragen.
 */
function newsletterFormBlocks(source) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('data-newsletter-signup', from);
    if (start === -1) break;
    const end = source.indexOf('</form>', start);
    assert.notEqual(end, -1, 'formulier zonder afsluitende </form>');
    blocks.push(source.slice(start, end));
    from = end;
  }
  return blocks;
}

test('elke submit-knop in een nieuwsbriefformulier draagt data-plausible-cta', () => {
  const offenders = [];
  let formsSeen = 0;

  for (const file of astroFiles(path.join(root, 'src'))) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('data-newsletter-signup')) continue;

    for (const block of newsletterFormBlocks(source)) {
      formsSeen += 1;
      for (const match of block.matchAll(/<button\b[^>]*>/g)) {
        if (!/\bdata-plausible-cta\s*=\s*["'][^"']+["']/.test(match[0])) {
          offenders.push(`${path.relative(root, file)}: ${match[0]}`);
        }
      }
    }
  }

  // Zonder deze ondergrens zou een hernoemd attribuut de hele scan leegmaken en
  // de test alsnog groen laten worden — nul gevonden formulieren bewijst niets.
  assert.ok(formsSeen >= 5, `verwachtte >= 5 nieuwsbriefformulieren, vond ${formsSeen}`);
  assert.deepEqual(offenders, [], `submit-knoppen zonder data-plausible-cta:\n${offenders.join('\n')}`);
});

test('de submit-handler zet het knoplabel in de newsletter_signup-props', () => {
  const source = readFileSync(path.join(root, 'src/lib/newsletter-signup.ts'), 'utf8');

  const call = source.indexOf("trackPlausible('newsletter_signup'");
  assert.notEqual(call, -1, "geen trackPlausible('newsletter_signup')-aanroep gevonden");

  const end = source.indexOf('});', call);
  assert.notEqual(end, -1, 'newsletter_signup-aanroep niet afgesloten');
  const props = source.slice(call, end);

  assert.match(
    props,
    /dataset\.plausibleCta/,
    'de newsletter_signup-props lezen data-plausible-cta niet — het label van de ' +
      'knop komt dan nergens aan en elk formulier blijft ononderscheidbaar',
  );
});
