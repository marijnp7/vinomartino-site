// Requires recorded R2 review and Telegram approval before --apply-approved.
// Pass a gzip-compressed migration manifest to the internal runner.
// Default is read-only preflight. Back up current source before execution.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
const data=readFileSync(process.argv[2]);
const m=JSON.parse(data[0]===31?gunzipSync(data).toString():data.toString());
const apply=process.argv.includes('--apply-approved');
async function api(path,method='GET',body) {
 const r=await fetch(`${process.env.DIRECTUS_URL}${path}`,{method,headers:{Authorization:`Bearer ${process.env.DIRECTUS_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw new Error(`${method} ${path}: HTTP ${r.status}`);
 return (await r.json()).data;
}
const rows=await api('/items/accommodations?limit=-1');
const bySlug=new Map(rows.map(r=>[r.slug,r]));
function resolve(value, key) {
 if(Array.isArray(value))return value.map(v => resolve(v));
 if(value && typeof value==='object') {
  if(key === 'accommodation_id' && Object.keys(value).length===1 && value.slug) {
   const row=bySlug.get(value.slug);if(!row)throw new Error(`Missing staged ${value.slug}`);return row.id;
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,k)]));
 }
 return value;
}
const patches=m.after_approval_patches.map(p=>({...p,after:resolve(p.after)}));
for(const staged of m.creates_draft) {
 const row=bySlug.get(staged.slug);if(!row)throw new Error(`Missing staged ${staged.slug}`);
 if(!['draft','published'].includes(row.status))throw new Error(`Unexpected status ${staged.slug}`);
 patches.push({collection:'accommodations',id:row.id,before:{status:'draft'},after:{status:'published'}});
}
// Preflight EVERY record before the first published-content mutation.
const pending=[];
for(const p of patches) {
 const current=await api(`/items/${p.collection}/${p.id}`);
 const pick=fields=>Object.fromEntries(Object.keys(fields).map(k=>[k,current[k]??null]));
 if(isDeepStrictEqual(pick(p.after),p.after))continue;
 if(!isDeepStrictEqual(pick(p.before),p.before))throw new Error(`Source drift ${p.collection}/${p.id}; refresh backup and reconcile`);
 pending.push(p);
}
console.log(JSON.stringify({preflight:'passed',pending:pending.length,apply}));
for(const p of pending) {
 if(apply) {
  await api(`/items/${p.collection}/${p.id}`,'PATCH',p.after);
  const current=await api(`/items/${p.collection}/${p.id}`);
  for(const [key,value] of Object.entries(p.after))if(!isDeepStrictEqual(current[key],value))throw new Error(`Readback mismatch ${p.collection}/${p.id}.${key}`);
 }
 console.log(JSON.stringify({action:apply?'updated-and-verified':'would-update',collection:p.collection,id:p.id,fields:Object.keys(p.after)}));
}
