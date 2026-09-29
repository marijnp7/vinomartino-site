// LAT-11997 (groeiplan 1.6, guard: LAT-11036): herstel land/streek-koppelingen voor gepubliceerde artikelen in verplichte rubrieken. Idempotent. --apply om te schrijven.
const U=(process.env.DIRECTUS_URL||'').replace(/\/$/,''),T=process.env.DIRECTUS_TOKEN,APPLY=process.argv.includes('--apply');
const H={Authorization:`Bearer ${T}`,'Content-Type':'application/json'};
const req=async(m,p,b)=>{const r=await fetch(U+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok)throw new Error(m+' '+p+' '+r.status+' '+t.slice(0,200));return t?JSON.parse(t):null};
// artikel-id -> [streek-ids] (land volgt uit streek.land_id) ; extra landen apart ; EXC = bewuste uitzondering
const S={4:[6],6:[1],14:[5],18:[3],75:[1],102:[28],138:[4],144:[7],5:[4],20:[9],30:[11],31:[13],33:[14],34:[15],35:[12],36:[16],47:[52],48:[11],59:[27],63:[24],66:[2],76:[6],81:[19],87:[32],88:[34],89:[33],
38:[11],39:[15],40:[12],41:[15],42:[13],43:[16],74:[50],19:[28],86:[7],7:[7],51:[28],65:[7],83:[1],
32:[11,13,14,15],37:[12],52:[23],58:[27],72:[1],129:[5],132:[4],136:[10],139:[7],91:[7,24,27],73:[3],80:[9],64:[]};
const LX={50:[4],29:[7],79:[10],82:[4],104:[5],44:[7],45:[7],64:[4]};
const EXC=[15,49,85,92,101,106,134,70,84];
const streken=Object.fromEntries((await req('GET','/items/streken?limit=-1&fields=id,land_id')).data.map(s=>[s.id,s.land_id]));
const ids=[...new Set([...Object.keys(S),...Object.keys(LX),...EXC].map(Number))];
let nS=0,nL=0,nE=0;
for(const id of ids){
 const a=(await req('GET',`/items/articles/${id}?fields=id,status,related_streken.streken_id,related_landen.landen_id`)).data;
 if(a.status!=='published'){console.log(id,'skip niet published');continue}
 const hasS=new Set(a.related_streken.map(x=>x.streken_id)),hasL=new Set(a.related_landen.map(x=>x.landen_id));
 const wantS=S[id]||[];const wantL=new Set([...(LX[id]||[]),...wantS.map(s=>streken[s]).filter(Boolean)]);
 for(const s of wantS)if(!hasS.has(s)){nS++;console.log(id,'+streek',s);if(APPLY)await req('POST','/items/articles_streken',{articles_id:id,streken_id:s})}
 for(const l of wantL)if(!hasL.has(l)){nL++;console.log(id,'+land',l);if(APPLY)await req('POST','/items/articles_landen',{articles_id:id,landen_id:l})}
 if(EXC.includes(id)){nE++;console.log(id,'uitzondering');if(APPLY)await req('PATCH','/items/articles/'+id,{geo_koppeling_uitzondering:true})}
}
console.log({APPLY,streekRijen:nS,landRijen:nL,uitzonderingen:nE});
