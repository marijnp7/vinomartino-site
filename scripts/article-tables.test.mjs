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
const { markdownToHtmlWithToc } = await import('../src/lib/markdown.ts');
const render = (md, opts={}) => markdownToHtmlWithToc(md,{editorialTables:true,...opts});
test('comparison stays semantic and preserves rich values',async()=>{
 const {html}=await render('| | A | B |\n|---|---|---|\n| Grape | **Fresh** | [Guide](/streken/loire/) |',{locale:'en'});
 assert.match(html,/editorial-table--comparison/);
 assert.match(html,/scope="row"/);
 assert.match(html,/<strong>Fresh<\/strong>/);
 assert.match(html,/href="\/en\/streken\/loire\/"/);
});
test('practical tables take mobile labels from CMS headers; no injection',async()=>{
 const {html}=await render('| Visit | Price | Reserve |\n|---|---|---|\n| House | €20 | Yes <script>alert(1)</script> |');
 assert.match(html,/editorial-table--cards/);
 assert.match(html,/aria-hidden="true">Price<\/span>/);
 assert.match(html,/role="table"/);
 assert.doesNotMatch(html,/<script|alert\(1\)/);
});
test('spanned tables retain relationships and avoid card conversion',async()=>{
 const {html}=await render('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="2">Both</td></tr></tbody></table>');
 assert.match(html,/colspan="2"/);
 assert.doesNotMatch(html,/editorial-table--cards/);
 assert.match(html,/tabindex="0"/);
});
test('other CMS renderers are unchanged unless opted in',async()=>{
 const {html}=await markdownToHtmlWithToc('| A | B |\n|---|---|\n| C | D |');
 assert.doesNotMatch(html,/editorial-table/);
});
