// LAT-13075: een body-kop "Bezoek" op een wijnhuisportret gaf een tweede id="bezoek"
// naast de sectie uit WijnhuisPortretBlokken.astro (34 NL-portretten op build 1312).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { markdownToHtmlWithToc } = await import('../src/lib/markdown.ts');

test('gereserveerde id krijgt -2 in de body', async () => {
  const { html, toc } = await markdownToHtmlWithToc('## Bezoek\n\ntekst\n\n## Bezoek\n\nmeer', { reservedIds: ['bezoek'] });
  assert.ok(!/id="bezoek"/.test(html), html);
  assert.deepEqual(toc.map((t) => t.id), ['bezoek-2', 'bezoek-3']);
});

test('zonder reservedIds blijft de slug ongewijzigd', async () => {
  const { toc } = await markdownToHtmlWithToc('## Bezoek\n\ntekst');
  assert.deepEqual(toc.map((t) => t.id), ['bezoek']);
});

test('wijnhuizen-loader reserveert de sectie-ids van het portrettemplate', () => {
  const loader = readFileSync(new URL('../src/lib/wijnhuizen.ts', import.meta.url), 'utf8');
  const tpl = readFileSync(new URL('../src/components/WijnhuisPortretBlokken.astro', import.meta.url), 'utf8');
  for (const id of [...tpl.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1])) {
    assert.ok(loader.includes(`'${id}'`), `sectie-id ${id} niet gereserveerd`);
  }
});
