import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRegionStays,hydrateRouteStays,toRegionStay} from '../src/lib/canonical-stays.ts';
const rows=Array.from({length:9},(_,i)=>({id:i+1,name:`Hotel ${i}`,tier:['slim_geboekt','prijs_kwaliteit','pure_luxe'][Math.floor(i/3)],streek_id:{slug:'champagne'},booking_url:`https://www.booking.com/hotel/fr/hotel-${i}.html`,description:'Existing copy',price_low:null}));
test('recommendations exclude route-only addresses and require exactly 3/3/3',()=>{
 assert.equal(canonicalRegionStays([...rows,{...rows[0],id:10,tags:['route_only']}],'champagne').length,9);
 assert.throws(()=>canonicalRegionStays(rows.slice(1),'champagne'),/expected 9/);
 assert.throws(()=>canonicalRegionStays(rows.map(r=>({...r,tier:'pure_luxe'})),'champagne'),/expected 3/);
});
test('both route shapes read hotel facts by id and retain route copy',()=>{
 const stay={accommodation_id:1,naam:'Stale',booking_url:'https://www.booking.com/searchresults.html',why:'Route context'};
 const input={days:[{overnachting:stay}],pagina:{dagen:[{slaap:stay}],slapen:{items:[stay]}}};
 const result=hydrateRouteStays(input,rows,true);
 for(const item of [result.days[0].overnachting,result.pagina.dagen[0].slaap,result.pagina.slapen.items[0]]) {
  assert.equal(item.naam,'Hotel 0');assert.equal(item.booking_url,rows[0].booking_url);assert.equal(item.why,'Route context');
 }
 assert.equal(input.days[0].overnachting.naam,'Stale');
});
test('missing, archived/unavailable and search destinations fail closed',()=>{
 assert.throws(()=>hydrateRouteStays({days:[{overnachting:{naam:'Missing'}}]},rows,true),/Missing accommodation_id/);
 assert.throws(()=>hydrateRouteStays({days:[{overnachting:{accommodation_id:12}}]},rows,true),/Unavailable/);
 assert.throws(()=>hydrateRouteStays({days:[{overnachting:{accommodation_id:1}}]},[{...rows[0],booking_url:'https://www.booking.com/searchresults.html'}],true),/direct hotel/);
});
test('region mapping preserves missing prices and existing copy',()=>{
 const mapped=toRegionStay(rows[0]);assert.equal(mapped.prijs_laag,null);assert.equal(mapped.why_this_one,'Existing copy');assert.equal(mapped.boeklink,rows[0].booking_url);
});
