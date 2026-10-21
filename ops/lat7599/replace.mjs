import fs from 'node:fs'; import crypto from 'node:crypto';
const U='http://localhost:8055', h={Authorization:`Bearer ${fs.readFileSync('/run/secrets/admin_token','utf8').trim()}`};
const sha=b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const lines=fs.readFileSync(process.argv[2],'utf8').trim().split('\n'); const lim=+(process.argv[3]||1e9);
let ok=0,fail=0;
for (const l of lines.slice(0,lim)) { const [id,size]=l.split(' ');
  try {
    const m=await (await fetch(`${U}/files/${id}?fields=id,filename_disk,filename_download,type,filesize,width,height,folder,title`,{headers:h})).json(); const f=m.data;
    const a=await fetch(`${U}/assets/${id}`,{headers:h}); const buf=await a.arrayBuffer(); const s0=sha(buf);
    if (a.status!==200 || String(buf.byteLength)!==String(size)) { console.log('SKIP',id,a.status,buf.byteLength,size); fail++; continue; }
    const fd=new FormData(); if(f.title!=null) fd.append('title',f.title); if(f.folder) fd.append('folder',f.folder);
    fd.append('file', new Blob([buf],{type:f.type}), f.filename_download);
    const p=await fetch(`${U}/files/${id}`,{method:'PATCH',headers:h,body:fd}); const pt=await p.text();
    if (p.status!==200) { console.log('FAIL',id,p.status,pt.slice(0,200)); fail++; continue; }
    const n=(JSON.parse(pt)).data;
    const b2=await (await fetch(`${U}/assets/${id}`,{headers:h})).arrayBuffer(); const s1=sha(b2);
    const same = s0===s1 && n.filename_disk===f.filename_disk && String(n.filesize)===String(size);
    console.log(same?'OK':'MISMATCH',id,n.filename_disk,n.filesize,`${f.width}x${f.height}->${n.width}x${n.height}`,s0.slice(0,12),s1.slice(0,12)); same?ok++:fail++;
  } catch(e){ console.log('ERR',id,String(e).slice(0,200)); fail++; }
}
console.log(`SUMMARY ok=${ok} fail=${fail} of ${Math.min(lim,lines.length)}`);
