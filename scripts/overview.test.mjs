import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewFacts, overviewIcon } from '../src/lib/overview.ts';
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
const { parseRoutePagina } = await import('../src/lib/route-pagina.ts');

test('preserves long CMS values, zero and editorial order; removes empty facts', () => {
 const text = 'A long vineyard description, '.repeat(20);
 const input = [{label:' Grapes ',value:text},{label:'Generation',value:'0'},{label:'',value:'hidden'},{label:'Budget',value:'  '}];
 const facts = overviewFacts(input);
 assert.equal(facts.length, 2);
 assert.equal(facts[0].value,text.trim());
 assert.equal(facts[1].value,'0');
 assert.equal(input[0].label,' Grapes ');
 assert.deepEqual(overviewFacts([]),[]);
});
test('recognises NL and EN labels, supports explicit icons and unknown CMS labels', () => {
 for (const [nl,en] of [['Druiven','Grapes'],['Duur','Duration'],['Basis','Base'],['Vervoer','Transport'],['Hectares','Hectares']]) assert.equal(overviewIcon(nl),overviewIcon(en));
 assert.equal(overviewIcon('Custom editorial label'),'info');
 assert.equal(overviewFacts([{label:'Custom',value:'x',icon:'home'}])[0].icon,'home');
});
test('optional CMS tips preserve old route JSON and reject incomplete tips', () => {
 const route = tip => ({ pagina: { dagen: [{ titel: 'Day one' }], glance: { feiten: [{label:'Duration',value:'2 days'}], tip } } });
 assert.equal(parseRoutePagina(route(undefined)).glance.tip,null);
 assert.equal(parseRoutePagina(route({titel:'Tip',tekst:' '})).glance.tip,null);
 assert.deepEqual(parseRoutePagina(route({titel:' Book ahead ',tekst:' Keep the car parked. '})).glance.tip,{title:'Book ahead',text:'Keep the car parked.'});
});
