// LAT-14625 / LAT-14622: rechten op Fritz Haag-bottle shot afgewezen. Bestand NIET verwijderen,
// alleen archiveren via tags. De seed-runner krijgt 403 op directus_files, daarom via lat12804.
// Idempotent: bestaande tags blijven staan, ontbrekende archieftags worden toegevoegd.
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) throw new Error('DIRECTUS_URL/DIRECTUS_TOKEN ontbreken');
const ID = 'e0f60084-8161-4ac6-a771-afd1431a0b2c';
const WANT = ['archief', 'rechten-afgewezen-lat14622'];
const h = { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' };
const get = async () => {
  const r = await fetch(`${U}/files/${ID}?fields=id,filename_download,tags`, { headers: h });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return (await r.json()).data;
};
const f = await get();
if (f.filename_download !== 'lat2460-mosel-riesling-fritz-haag.jpg') throw new Error(`onverwacht bestand: ${f.filename_download}`);
if (WANT.every((t) => (f.tags || []).includes(t))) {
  console.log('al gearchiveerd, niets te doen', JSON.stringify(f.tags));
} else {
  const tags = [...new Set([...(f.tags || []), ...WANT])];
  const r = await fetch(`${U}/files/${ID}`, { method: 'PATCH', headers: h, body: JSON.stringify({ tags }) });
  if (!r.ok) throw new Error(`PATCH ${r.status} ${await r.text()}`);
}
const after = await get();
if (!WANT.every((t) => (after.tags || []).includes(t))) throw new Error('verificatie faalt');
console.log('OK', ID, JSON.stringify(after.tags));
