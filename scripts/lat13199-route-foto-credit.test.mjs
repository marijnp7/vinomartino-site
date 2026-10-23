// LAT-13199: een `::foto` met een CC BY-SA-beeld toont maker, licentie en bronlink onder het bijschrift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({ resolve(specifier, context, nextResolve) {
 if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
  const url = new URL(`${specifier}.ts`, context.parentURL);
  if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
 }
 return nextResolve(specifier, context);
}});
const { renderEnrichedRouteBody } = await import('../src/lib/route-body.ts');
const md = '## Dag 2\n\n::foto{ref="c8e53ab3-d7ae-402f-9ab7-f9b4f40f631a" bijschrift="Clos Saint-Jacques in Gevrey-Chambertin."}\n\nTekst.';
const base = { downloadFoto: async (ref) => `/images/routes/body-${ref}.jpg`, resolveBoekHref: async () => null, disclosure: '', locale: 'nl' };
const SRC = 'https://commons.wikimedia.org/wiki/File:Gevrey-Chambertin_(21)_Le_Clos_Saint-Jacques_-_01.jpg';

test('CC-credit onder het bijschrift, met licentie- en bronlink', async () => {
 const { html } = await renderEnrichedRouteBody(md, { ...base, creditFor: async () => ({ author: 'Foto: GO69', licenseLabel: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', sourceUrl: SRC, sourceLabel: 'Wikimedia Commons', note: 'kleur en uitsnede bewerkt' }) });
 const cap = html.match(/<figcaption>([\s\S]*?)<\/figcaption>/)[1];
 assert.match(cap, /^Clos Saint-Jacques in Gevrey-Chambertin\./);
 assert.match(cap, /class="route-foto__credit">Foto: GO69, <a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/"[^>]*>CC BY-SA 4\.0<\/a>/);
 assert.ok(cap.includes('href="' + SRC + '"'), 'volledige Commons-URL blijft heel');
 assert.match(cap, /via Wikimedia Commons<\/a> \(kleur en uitsnede bewerkt\)/);
});

test('zonder credit (eigen beeld) blijft het figuur byte-gelijk aan vroeger', async () => {
 const a = (await renderEnrichedRouteBody(md, base)).html;
 const b = (await renderEnrichedRouteBody(md, { ...base, creditFor: async () => null })).html;
 assert.equal(a, b);
 assert.doesNotMatch(a, /route-foto__credit/);
});

test('falende credit-lookup breekt de build niet', async () => {
 const { html } = await renderEnrichedRouteBody(md, { ...base, creditFor: async () => { throw new Error('dam weg'); } });
 assert.match(html, /<figure class="route-foto">/);
});
