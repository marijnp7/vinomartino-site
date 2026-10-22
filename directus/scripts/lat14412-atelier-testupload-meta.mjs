// LAT-14412 / LAT-14410: losse Atelier-testupload zonder metadata. Niet verwijderen, alleen de
// metadata herstellen (omkeerbaar): synthetisch=true, licentie=synthetisch, plus archieftag.
// De correcte kopie ebe39ca4 wordt alleen gelezen. De Atelier-/seed-identiteit krijgt 403 op
// directus_files, daarom via lat12804. Idempotent.
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) throw new Error('DIRECTUS_URL/DIRECTUS_TOKEN ontbreken');
const ID = 'f4bd38fb-1e38-499f-96f7-0d22bb7b03ea';
const OK_COPY = 'ebe39ca4-5843-46f5-b53d-e596def05385';
const TAG = 'dubbele-testupload-lat14412';
const h = { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' };
const get = async (id) => {
  const r = await fetch(`${U}/files/${id}?fields=id,filename_download,synthetisch,licentie,tags`, { headers: h });
  if (!r.ok) throw new Error(`GET ${id} ${r.status}`);
  return (await r.json()).data;
};
const copy = await get(OK_COPY);
if (copy.synthetisch !== true || copy.licentie !== 'synthetisch') throw new Error(`correcte kopie wijkt af: ${JSON.stringify(copy)}`);
const f = await get(ID);
console.log('voor', JSON.stringify(f));
if (!(f.synthetisch === true && f.licentie === 'synthetisch' && (f.tags || []).includes(TAG))) {
  const tags = [...new Set([...(f.tags || []), TAG])];
  const r = await fetch(`${U}/files/${ID}`, { method: 'PATCH', headers: h, body: JSON.stringify({ synthetisch: true, licentie: 'synthetisch', tags }) });
  if (!r.ok) throw new Error(`PATCH ${r.status} ${await r.text()}`);
}
const after = await get(ID), copyAfter = await get(OK_COPY);
if (after.synthetisch !== true || after.licentie !== 'synthetisch') throw new Error('verificatie faalt');
if (JSON.stringify(copyAfter) !== JSON.stringify(copy)) throw new Error('correcte kopie is veranderd');
console.log('OK', JSON.stringify(after), 'kopie ongewijzigd', JSON.stringify(copyAfter));
