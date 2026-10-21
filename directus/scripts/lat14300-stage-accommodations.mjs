// Stage the four approved legacy-only addresses. Never publishes or archives.
// Usage: directus-run-internal.sh --script <this> --data <manifest> -- [--apply]
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync(process.argv[2],'utf8'));
const apply=process.argv.includes('--apply');
const base=process.env.DIRECTUS_URL?.replace(/\/$/,'');
const token=process.env.DIRECTUS_TOKEN;
if (!base || !token) throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN required');
async function api(path,method='GET',body) {
 const res=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status}`);
 return (await res.json()).data;
}
for(const item of manifest.creates_draft) {
 if(item.status!=='draft') throw new Error('Only draft creation is allowed');
 const existing=await api(`/items/accommodations?filter[slug][_eq]=${encodeURIComponent(item.slug)}&limit=2`);
 if(existing.length>1) throw new Error(`Duplicate slug: ${item.slug}`);
 let record=existing[0];
 if(record) {
  for(const key of ['name','streek_id','booking_url']) if(record[key]!==item[key]) throw new Error(`Existing ${item.slug} differs in ${key}; manual reconciliation required`);
 } else if(apply) record=await api('/items/accommodations','POST',item);
 console.log(JSON.stringify({action:record?'reused-or-created':'would-create-draft',id:record?.id,slug:item.slug}));
 for(const translation of manifest.translations.filter(t=>t.slug===item.slug)) {
  if(!record) continue;
  const rows=await api(`/items/accommodations_translations?filter[accommodations_id][_eq]=${record.id}&filter[languages_code][_eq]=${encodeURIComponent(translation.languages_code)}&limit=2`);
  const {slug,...fields}=translation;
  if(rows.length>1) throw new Error(`Duplicate translation for ${slug}`);
  if(rows[0]) {
   for(const key of Object.keys(fields)) if(rows[0][key]!==fields[key]) throw new Error(`Translation drift: ${slug}.${key}`);
  } else if(apply) await api('/items/accommodations_translations','POST',{accommodations_id:record.id,...fields});
  console.log(JSON.stringify({action:rows[0]?'translation-preserved':apply?'translation-created':'would-create-translation',id:record.id,locale:fields.languages_code}));
 }
}
