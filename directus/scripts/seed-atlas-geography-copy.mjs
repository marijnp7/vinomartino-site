// CMS-owned map copy, both locales. Idempotent; no changes to article content.
const rows = {
 'atlas.kicker': ['Wijnatlas · {country}', 'Wine atlas · {country}'],
 'atlas.title': ['De wijnstreken van {country}', 'The wine regions of {country}'],
 'atlas.intro': ['Van wijngebied naar reisplan. Kies een gekleurd gebied of een nummer en ontdek de streek.', 'From wine region to travel plan. Choose a coloured area or a number to explore the region.'],
 'atlas.method.municipality': ['De vlakken combineren wijnappellaties op gemeenteniveau. Ze tonen herkomstgebieden, niet de afzonderlijke wijngaardpercelen.', 'The shapes combine wine appellations at municipality level. They show geographical areas of origin, not individual vineyard parcels.'],
 'atlas.method.wineOrigin': ['De vlakken tonen Wine of Origin-districten en wards. Hemel-en-Aarde combineert de drie gelijknamige wards.', 'The shapes show Wine of Origin districts and wards. Hemel-en-Aarde combines its three named wards.'],
 'atlas.sources': ['Kaartbronnen', 'Map sources'],
 'atlas.mapLabel': ['Klikbare kaart met de wijngebieden van {country}', 'Interactive map of the wine regions of {country}'],
 'atlas.source.eu': ['Candiago e.a. (2022), wijnappellaties · CC0', 'Candiago et al. (2022), wine appellations · CC0'],
 'atlas.source.za': ['SAWIS, Wine of Origin-kaart', 'SAWIS, Wine of Origin map'],
 'atlas.source.base': ['Natural Earth, achtergrondkaart', 'Natural Earth, base map'],
};
const base=process.env.DIRECTUS_URL;
const headers={Authorization:`Bearer ${process.env.DIRECTUS_TOKEN}`,'Content-Type':'application/json'};
async function api(method,path,body){const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`${method} ${path}: HTTP ${r.status}`);return r.status===204?null:(await r.json()).data;}
for(const [key,values] of Object.entries(rows)){
 const found=await api('GET',`/items/ui_strings?filter[key][_eq]=${encodeURIComponent(key)}&fields=id,translations.id,translations.languages_code,translations.value`);
 const row=found[0]??await api('POST','/items/ui_strings',{key,context:'Country wine geography map'});
 for(const [i,lang] of ['nl','en'].entries()){
  const tr=row.translations?.find(t=>t.languages_code===lang);
  if(tr?.value===values[i])continue;
  await api(tr?'PATCH':'POST',`/items/ui_strings_translations${tr?'/'+tr.id:''}`,tr?{value:values[i]}:{ui_strings_id:row.id,languages_code:lang,value:values[i]});
 }
 console.log(`${key}: NL + EN saved`);
}
