// LAT-12594 K2: op /accommodaties/ is de eerste kaartfoto het LCP-element (QA, build 1462).
// Die mag niet lazy laden; de rest wel. Beeldbestanden en srcset blijven ongewijzigd.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../src/components/AccommodatiesIndex.astro', import.meta.url), 'utf8');
assert.match(src, /regios\.map\(\(r, i\) =>/, 'kaartlus moet de index doorgeven');
assert.match(src, /class="card-img" loading=\{i === 0 \? 'eager' : 'lazy'\}/, 'eerste kaart eager, rest lazy');
assert.match(src, /fetchpriority=\{i === 0 \? 'high' : undefined\}/, 'alleen eerste kaart fetchpriority=high');
console.log('ok lat12594-acc-lcp-eager');
