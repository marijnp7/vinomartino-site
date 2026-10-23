import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRegionStays,hydrateRouteStays,toRegionStay,stayMemberships,clearUntranslatedText} from '../src/lib/canonical-stays.ts';
const rows=Array.from({length:9},(_,i)=>({id:i+1,name:`Hotel ${i}`,tier:['slim_geboekt','prijs_kwaliteit','pure_luxe'][Math.floor(i/3)],streek_id:{slug:'champagne'},booking_url:`https://www.booking.com/hotel/fr/hotel-${i}.html`,description:'Existing copy',price_low:null}));
test('recommendations exclude route-only and buiten_selectie, allow 3 to 9 with at most 3 per tier',()=>{
 assert.equal(canonicalRegionStays([...rows,{...rows[0],id:10,tags:['route_only']},{...rows[0],id:11,tags:['buiten_selectie']}],'champagne').length,9);
 assert.equal(canonicalRegionStays(rows.slice(1),'champagne').length,8);
 assert.equal(canonicalRegionStays(rows,'rioja').length,0);
 assert.throws(()=>canonicalRegionStays(rows.slice(0,2),'champagne'),/expected 3 to 9/);
 assert.throws(()=>canonicalRegionStays([...rows,{...rows[0],id:10}],'champagne'),/expected 3 to 9/);
 assert.throws(()=>canonicalRegionStays(rows.map(r=>({...r,tier:'pure_luxe'})),'champagne'),/at most 3 in pure_luxe/);
});
test('a shared hotel counts in a second streek with that streek\'s tier, without a second record',()=>{
 const shared={...rows[3],id:20,streek_id:{slug:'kamptal'},tier:'prijs_kwaliteit',tags:['extra_streek:champagne:pure_luxe']};
 assert.deepEqual(stayMemberships(shared),[{slug:'kamptal',tier:'prijs_kwaliteit'},{slug:'champagne',tier:'pure_luxe'}]);
 const set=canonicalRegionStays([...rows.filter(r=>r.id!==9),shared],'champagne');
 assert.equal(set.length,9);assert.equal(set.find(r=>r.id===20).tier,'pure_luxe');
 assert.equal(canonicalRegionStays([shared,...rows.map(r=>({...r,streek_id:{slug:'kamptal'}})).slice(0,3)],'kamptal').find(r=>r.id===20).tier,'prijs_kwaliteit');
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
test('EN keeps every record and clears text that is still Dutch',()=>{
 const nl=[{id:1,description:'NL tekst',why_this_one:'NL waarom'},{id:2,description:'NL twee',why_this_one:null}];
 const en=[{id:1,description:'EN text',why_this_one:'NL waarom'},{id:2,description:'NL twee',why_this_one:null}];
 const out=clearUntranslatedText(en,nl,['description','why_this_one']);
 assert.equal(out.length,2);assert.equal(out[0].description,'EN text');assert.equal(out[0].why_this_one,null);assert.equal(out[1].description,null);
});
