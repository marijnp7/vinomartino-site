// LAT-2819 — regressietest op de locale-aware interne links in redactionele
// body-content (Directus `body` → markdownToHtml). De componenten-hrefs zijn in
// LAT-2704 al locale-aware gemaakt; deze test bewaakt de tweede categorie: de
// links die de redactie zélf in de markdown schrijft.
//
// Draait op de echte pipeline (src/lib/markdown.ts) en dus op dezelfde
// sanitize/allowlist-pas als de site. Geen nieuwe dependency: Node strip-types
// leest de TS-bronnen rechtstreeks, een resolve-hook plakt de `.ts`-extensie
// terug op de extensieloze interne imports (die schrijfwijze is TS-idioom, niet
// Node-ESM-idioom).
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { markdownToHtml } = await import('../src/lib/markdown.ts');
const { renderEnrichedRouteBody } = await import('../src/lib/route-body.ts');

const BODY = [
  'Lees ook [de Rhône in drie dagen](/artikelen/van-macon-naar-aix-rhone-route/).',
  'En [slapen in de Langhe](/accommodaties/langhe-piemonte/) of [de streek](/streken/langhe-piemonte/#kaart).',
  'Boek via [Booking](https://booking.com/x) of mail [ons](mailto:hoi@vinomartino.com).',
  'De [nareis](/reizen-nareizen/langhe-piemonte/) bestaat alleen in het NL.',
  'Download de [kaart](/images/langhe.png) en het [feed](/rss.xml).',
  '![De Langhe](/images/langhe.png)',
  'Terug naar [het begin](#intro).',
  '<p>Redactionele HTML: <a href="/wijnhuizen/mascarello/">Mascarello</a>.</p>',
].join('\n\n');

test('EN: interne body-links krijgen het /en/-voorvoegsel', async () => {
  const html = await markdownToHtml(BODY, { locale: 'en' });
  assert.match(html, /href="\/en\/artikelen\/van-macon-naar-aix-rhone-route\/"/);
  assert.match(html, /href="\/en\/accommodaties\/langhe-piemonte\/"/);
  assert.match(html, /href="\/en\/wijnhuizen\/mascarello\/"/, 'ook links uit ruwe redactionele HTML');
});

test('EN: hash en query blijven achter het gelokaliseerde pad staan', async () => {
  const html = await markdownToHtml(BODY, { locale: 'en' });
  assert.match(html, /href="\/en\/streken\/langhe-piemonte\/#kaart"/);
});

test('EN: externe, mailto, hash-only, assets en NL-only families blijven ongemoeid', async () => {
  const html = await markdownToHtml(BODY, { locale: 'en' });
  assert.match(html, /href="https:\/\/booking\.com\/x"/);
  assert.match(html, /href="mailto:hoi@vinomartino\.com"/);
  assert.match(html, /href="#intro"/);
  assert.match(html, /href="\/rss\.xml"/);
  assert.match(html, /href="\/reizen-nareizen\/langhe-piemonte\/"/);
  // Afbeeldingen zijn locale-loos: de src mag nooit onder /en/ belanden.
  assert.match(html, /src="\/images\/langhe\.png"/);
  assert.doesNotMatch(html, /src="\/en\//);
});

test('EN: geen dubbele prefix op een al gelokaliseerd pad', async () => {
  const html = await markdownToHtml('[al EN](/en/artikelen/x/)', { locale: 'en' });
  assert.match(html, /href="\/en\/artikelen\/x\/"/);
  assert.doesNotMatch(html, /\/en\/en\//);
});

test('NL blijft byte-identiek, met en zonder expliciete locale', async () => {
  const zonder = await markdownToHtml(BODY);
  const met = await markdownToHtml(BODY, { locale: 'nl' });
  assert.equal(zonder, met);
  assert.match(zonder, /href="\/artikelen\/van-macon-naar-aix-rhone-route\/"/);
  assert.doesNotMatch(zonder, /\/en\//);
});

// De verrijkte routepagina (LAT-2270, `:::foto`/`:::boek`) rendert via een eigen
// mdast-transform en pas daarna via de gedeelde sanitize/toc-pas. Deze test
// bewaakt dat de locale ook langs dat tweede pad wordt doorgegeven.
test('verrijkte route-body: interne links volgen dezelfde localisatie', async () => {
  const md = 'Meer in [de Langhe](/streken/langhe-piemonte/).\n\n:::boek{zoek="Barolo"}\nBoek hier\n:::\n';
  const ctx = {
    disclosure: 'Affiliate',
    downloadFoto: async () => null,
    resolveBoekHref: async () => 'https://booking.com/searchresults?ss=Barolo',
  };
  const en = await renderEnrichedRouteBody(md, { ...ctx, locale: 'en' });
  assert.match(en.html, /href="\/en\/streken\/langhe-piemonte\/"/);
  assert.match(en.html, /href="https:\/\/booking\.com\/searchresults\?ss=Barolo"/);

  const nl = await renderEnrichedRouteBody(md, ctx);
  assert.match(nl.html, /href="\/streken\/langhe-piemonte\/"/);
  assert.doesNotMatch(nl.html, /\/en\//);
});
