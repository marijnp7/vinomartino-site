import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layoutAtlasLabels } from '../src/lib/atlas-labels.ts';
const root=new URL('../src/data/atlas/',import.meta.url);
const files=readdirSync(new URL('wine-areas/',root)).filter(f=>f.endsWith('.geojson'));
const areas=Object.fromEntries(files.flatMap(f=>JSON.parse(readFileSync(new URL('wine-areas/'+f,root))).features.map(v=>[v.properties.slug,v])));
function inRing(p,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
function contains(slug,p){const g=areas[slug].geometry;return (g.type==='Polygon'?[g.coordinates]:g.coordinates).some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(h=>inRing(p,h)));}
test('all 40 published regions have sourced wine geometry',()=>{
 assert.equal(files.length,9);assert.equal(Object.keys(areas).length,40);
 for(const f of Object.values(areas)){assert.ok(f.properties.source.startsWith('https://'));assert.ok(f.properties.sourceIds.length);assert.ok(['municipality','wine-origin'].includes(f.properties.resolution));assert.ok(contains(f.properties.slug,f.properties.labelLonLat));}
});
test('Loire extends through Muscadet, Anjou, Touraine and Centre-Loire',()=>{
 for(const p of [[-1.282,47.087],[-.55,47.47],[.8,47.412],[2.837,47.331]])assert.ok(contains('loire',p),JSON.stringify(p));
 assert.ok(!contains('loire',[1.49,48.44]),'Chartres is not a Loire wine area');
});
test('Rhône includes the southern crus, Champagne includes the Aisne',()=>{
 assert.ok(contains('rhone',[4.832,44.056]));
 assert.ok(contains('rhone',[4.748,45.49]));
 assert.ok(contains('champagne',[3.402,49.048]));
 assert.ok(!contains('provence',[6.65,44.9]),'Alpine PACA is not Provence wine country');
});
test('small appellations no longer borrow entire provinces',()=>{
 assert.ok(contains('priorat-catalonie',[.777,41.193]));
 assert.ok(!contains('priorat-catalonie',[1.244,41.119]),'Tarragona city excluded');
 assert.ok(!contains('etna-sicilie',[14.514,37.237]),'Caltagirone excluded');
 assert.ok(!contains('langhe-piemonte',[7.686,45.07]),'Turin excluded');
 assert.ok(contains('rioja',[-2.585,42.554]),'Rioja Alavesa included');
});
test('every generated map has distinct context, visible wine areas and separated labels',()=>{
 for(const f of readdirSync(new URL('regions/',root))){
  const data=JSON.parse(readFileSync(new URL('regions/'+f,root)));
  assert.equal(data._meta.geometryVersion,'wine-pdo-2026-10-10');
  const wine=Object.entries(data.regions).filter(([,r])=>r.wine);
  assert.ok(wine.length);assert.ok(!data.markers?.length);
  for(const [key,r] of wine){assert.ok(areas[key]);assert.ok(r.sourceIds?.length);assert.ok(r.d.length>30);assert.ok(!key.startsWith('ctx:'));}
  const box=data._meta.viewBox.split(' ').map(Number),radius=Math.max(box[2],box[3])*.021;
  const labels=layoutAtlasLabels(wine.map(([,r])=>r.labelAt),box,radius);
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(Math.hypot(labels[i].x-labels[j].x,labels[i].y-labels[j].y)>=2*radius+7.9,`${f}: labels collide`);
 }
});
test('coincident tiny-region labels separate without changing geographic anchors',()=>{
 const points=[{x:50,y:50},{x:50,y:50},{x:50,y:50}];const copy=JSON.stringify(points);
 const labels=layoutAtlasLabels(points,[0,0,200,200],10);
 assert.equal(JSON.stringify(points),copy);
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(Math.hypot(labels[i].x-labels[j].x,labels[i].y-labels[j].y)>27.9);
});

test('Kakheti uses the PDO geographic area and excludes Tbilisi',()=>{
 assert.ok(contains('kakheti-georgie',[45.473,41.919]));
 assert.ok(!contains('kakheti-georgie',[44.793,41.715]));
 assert.ok(areas['kakheti-georgie'].properties.sourceIds.includes('NWA-PDO-789:section-4'));
});
