// Idempotent migration: fill missing translations, preserve editorial changes.
import { readFile } from 'node:fs/promises';
const rows = JSON.parse(await readFile(new URL('./overview-copy.json', import.meta.url), 'utf8'));
const base=process.env.DIRECTUS_URL;
const headers={Authorization:`Bearer ${process.env.DIRECTUS_TOKEN}`,'Content-Type':'application/json'};
async function api(method,path,body){const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`${method} ${path}: HTTP ${r.status}`);return r.status===204?null:(await r.json()).data;}
for(const [key,values] of Object.entries(rows)){
 const found=await api('GET',`/items/ui_strings?filter[key][_eq]=${encodeURIComponent(key)}&fields=id,translations.id,translations.languages_code,translations.value`);
 const row=found[0]??await api('POST','/items/ui_strings',{key,context:'Reusable overview facts'});
 for(const [i,lang] of ['nl','en'].entries()){
  const tr=row.translations?.find(t=>t.languages_code===lang);
  if(tr?.value?.trim())continue;
  await api(tr?'PATCH':'POST',`/items/ui_strings_translations${tr?'/'+tr.id:''}`,tr?{value:values[i]}:{ui_strings_id:row.id,languages_code:lang,value:values[i]});
 }
 console.log(`${key}: NL + EN present (existing copy preserved)`);
}
