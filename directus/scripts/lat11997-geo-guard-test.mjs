// LAT-11997: redtest van de geo-guard (LAT-11036) met de scoped seed-identiteit; ruimt wegwerpartikelen op.
const U=(process.env.DIRECTUS_URL||'').replace(/\/$/,''),T=process.env.DIRECTUS_TOKEN;
const H={Authorization:`Bearer ${T}`,'Content-Type':'application/json'};
const req=async(m,p,b)=>{const r=await fetch(U+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});const t=await r.text();return {s:r.status,t}};
const who=await req('GET','/users/me?fields=email');console.log('token-identiteit ok',who.s);
const hero=JSON.parse((await req('GET','/items/articles/87?fields=hero_image')).t).data.hero_image;
const base={title:'LAT-11997 guardtest wegwerp',description:'x',body:'x',status:'draft',author:'Sophie',hero_image:hero};
const made=[];const mk=async(o)=>{const r=await req('POST','/items/articles',{...base,slug:'lat11997-gt-'+Math.random().toString(36).slice(2,8),...o});let id;try{id=JSON.parse(r.t).data?.id}catch{}; if(id)made.push(id);return {r,id}};
const show=(l,r)=>console.log(l.padEnd(46),r.s,(()=>{try{const j=JSON.parse(r.t);return j.errors?j.errors[0].extensions.code+' | '+j.errors[0].message.slice(0,170):'ok'}catch{return r.t.slice(0,80)}})());
let a=await mk({category:'Regio-gidsen',pub_date:'2026-10-02'});show('draft met toekomstige pub_date',a.r);
show('PATCH published (pub_date toekomst)',await req('PATCH','/items/articles/'+a.id,{status:'published'}));
let b=await mk({category:'Regio-gidsen',pub_date:'2026-10-02'});
show('PATCH published via /items/articles?keys',await req('PATCH','/items/articles',{keys:[b.id],data:{status:'published'}}));
let c=await mk({category:'Regio-gidsen',pub_date:'2026-10-02'});
show('PATCH published, payload id string',await req('PATCH','/items/articles/'+String(c.id),{status:'published',updated_at:new Date().toISOString()}));
for(const id of made){await req('DELETE','/items/articles_landen?filter[articles_id][_eq]='+id);const x=await req('DELETE','/items/articles/'+id);console.log('cleanup',id,x.s)}
