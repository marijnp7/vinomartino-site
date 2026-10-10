import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathViewBox, detailAreaPath } from '../src/lib/wine-map-bounds.ts';
const root = new URL('../src/data/atlas/regions/', import.meta.url);
test('detail view contains every island of every wine area, with padding', () => {
 for (const file of readdirSync(root)) {
  const atlas = JSON.parse(readFileSync(new URL(file, root)));
  for (const area of Object.values(atlas.regions).filter(r => r.wine)) {
   const [x,y,w,h] = pathViewBox(area.d).split(' ').map(Number);
   assert.ok(w>0 && h>0);
   const points = area.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
   for(let i=0;i<points.length;i+=2) { assert.ok(points[i]>x && points[i]<x+w); assert.ok(points[i+1]>y && points[i+1]<y+h); }
  }
 }
});
test('disconnected and negative-coordinate rings stay visible', () => {
 const [x,y,w,h]=pathViewBox('M-20 -10 L-10 -10 L-10 0 Z M100 50 L105 55 L110 50 Z').split(' ').map(Number);
 assert.ok(x < -20 && y < -10 && x+w > 110 && y+h > 55);
 assert.throws(()=>pathViewBox(''),/Invalid/);
});

test('detail preview retains source rings including small islands and holes', () => {
 const g={type:'MultiPolygon',coordinates:[[[[10,40],[11,40],[11,41],[10,40]],[[10.2,40.2],[10.3,40.2],[10.3,40.3],[10.2,40.2]]],[[[12,40],[12.01,40],[12.01,40.01],[12,40]]]]};
 const {d,viewBox}=detailAreaPath(g);
 assert.equal((d.match(/M/g)||[]).length,3);
 assert.equal((d.match(/ L/g)||[]).length,9);
 assert.ok(viewBox.split(' ').map(Number).every(Number.isFinite));
});
