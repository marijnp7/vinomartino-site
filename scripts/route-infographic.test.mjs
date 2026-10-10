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
const render = (body,locale='nl') => renderEnrichedRouteBody(`:::infographic\n${body}\n:::`, {downloadFoto:async()=>null,resolveBoekHref:async()=>null,disclosure:'',locale});

test('NL and EN distance facts become connected routes with no fabricated labels',async()=>{
 for (const [locale,header,label,value] of [['nl','Kenmerk | Waarde','Afstanden','A tot B 34 km, B tot C 15 km'],['en','Feature | Value','Distances','A to B about 33 km, B to C about 15 km']]) {
  const {html}=await render(`### Heading\n\n| ${header} |\n|---|---|\n| **${label}** | ${value} |\n| **${locale==='nl'?'Druiven':'Grapes'}** | Test grape |`,locale);
  assert.match(html,/<ol class="route-infographic__journey">/);
  assert.equal((html.match(/class="route-infographic__stop"/g)||[]).length,3);
  assert.match(html,/route-infographic__fact--grapes/);
  assert.match(html,/Test grape/);
  assert.doesNotMatch(html,/<table/);
 }
});

test('ambiguous distances and rich values remain intact; normal sanitization and locale links apply',async()=>{
 const {html}=await render(`| Feature | Value |\n|---|---|\n| **Distances** | A to B 34 km, D to E 15 km |\n| **Grapes** | [Guide](/streken/loire/) and *fresh* <script>alert(1)</script> |`,'en');
 assert.doesNotMatch(html,/route-infographic__journey/);
 assert.match(html,/A to B 34 km, D to E 15 km/);
 assert.match(html,/href="\/en\/streken\/loire\/"/);
 assert.match(html,/<em>fresh<\/em>/);
 assert.doesNotMatch(html,/<script|alert\(1\)/);
});

test('comparison tables retain their headers and cells, including two-column comparisons',async()=>{
 for (const table of ['| Region | Style |\n|---|---|\n| A | B |','| Subzone | Location | Style |\n|---|---|---|\n| A | B | C |']) {
  const {html}=await render(table);
  assert.match(html,/<table>/);
  assert.match(html,/<th>/);
  assert.doesNotMatch(html,/route-infographic__facts/);
 }
});

test('empty headers work; surrounding prose and footer emphasis survive',async()=>{
 const {html}=await render('### Heading\n\nIntro.\n\n| | |\n|---|---|\n| **Soil** | Flint |\n\n**Base:** Village');
 assert.match(html,/route-infographic__fact--land/);
 assert.match(html,/Intro\./);
 assert.match(html,/<div class="route-infographic__note route-infographic__note--home"><p><strong>Base:<\/strong> Village<\/p><\/div>/);
});
