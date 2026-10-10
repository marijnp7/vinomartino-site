import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContentLinks, bodyContentRefs, canonicalContentKey, contentKey} from '../src/lib/content-links.ts';
import {localizeHref} from '../src/lib/i18n.ts';
const node = (kind, slug, props = {}) => ({kind, slug, name: slug, regions: [], refs: [], ...props});
const keys = links => links.map(n => contentKey(n.kind, n.slug));
test('all explicit references are reciprocal, including more than six wineries', () => {
  const wineries = Array.from({length: 12}, (_, i) => node('wijnhuizen', `house-${i}`));
  const article = node('artikelen', 'guide', {refs: wineries.map(n => contentKey(n.kind,n.slug))});
  const graph = buildContentLinks([article, ...wineries]);
  assert.equal(graph.get('artikelen/guide').length, 12);
  for (const w of wineries) assert.deepEqual(keys(graph.get(contentKey(w.kind,w.slug))), ['artikelen/guide']);
});
test('unpublished/untranslated targets and self references never become links', () => {
  const article = node('artikelen', 'live', {refs: ['artikelen/live', 'artikelen/future', 'streken/draft', 'wijnhuizen/nl-only']});
  assert.deepEqual(buildContentLinks([article]).get('artikelen/live'), []);
});
test('same-region discovery is symmetric across all four page types', () => {
  const nodes = ['streken','artikelen','wijnroutes','wijnhuizen'].map((kind,i) => node(kind,i ? kind : 'region',{regions:['region']}));
  const graph=buildContentLinks(nodes);
  for (const n of nodes) assert.equal(graph.get(contentKey(n.kind,n.slug)).length,3);
});
test('empty regions connect to same-country regions, never to an arbitrary country', () => {
  const nodes=[node('streken','empty',{country:'italie'}),node('streken','active',{country:'italie'}),node('streken','other',{country:'frankrijk'})];
  const graph=buildContentLinks(nodes);
  assert.deepEqual(keys(graph.get('streken/empty')),['streken/active']);
  assert.deepEqual(graph.get('streken/other'),[]);
});
test('non-geographic articles form a reciprocal chain in their CMS category', () => {
  const graph=buildContentLinks(['a','b','c','d'].map(slug=>node('artikelen',slug,{category:'Opinie'})));
  for (const [key, links] of graph) {
    assert.equal(links.length,2);
    for (const n of links) assert.ok(keys(graph.get(contentKey(n.kind,n.slug))).includes(key));
  }
});
test('body refs accept both locales and absolute internal URLs but reject external lookalikes', () => {
  assert.deepEqual(bodyContentRefs('<a href="/en/streken/loire/#kaart">a</a><a href="https://vinomartino.com/wijnhuizen/house/">b</a><a href="https://example.org/streken/fake/">c</a><a href="/wijnhuizen/">all</a>'),['streken/loire','wijnhuizen/house']);
});
test('retired Langhe article goes directly to its English keeper, preserving fragments', () => {
  assert.equal(localizeHref('/artikelen/overnachten-langhe-barolo-agriturismi/#slapen','en'),'/en/artikelen/waar-slapen-langhe-piemonte/#slapen');
  assert.equal(localizeHref('/artikelen/overnachten-langhe-barolo-agriturismi/','nl'),'/artikelen/overnachten-langhe-barolo-agriturismi/');
});

test('existing aliases resolve to their keeper without removing the NL Langhe article', () => {
  assert.equal(canonicalContentKey('artikelen/een-week-in-piemonte-barolo-barbaresco-en-alles-daartussenin','nl'),'artikelen/een-week-in-piemonte');
  assert.equal(canonicalContentKey('artikelen/overnachten-langhe-barolo-agriturismi','en'),'artikelen/waar-slapen-langhe-piemonte');
  assert.equal(canonicalContentKey('artikelen/overnachten-langhe-barolo-agriturismi','nl'),'artikelen/overnachten-langhe-barolo-agriturismi');
});
