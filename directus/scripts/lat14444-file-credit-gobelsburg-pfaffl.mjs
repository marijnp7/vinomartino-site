#!/usr/bin/env node
// LAT-14444 / LAT-14462: credit the 10 house-supplied files on Schloss Gobelsburg (138) and Pfaffl (139).
// Only licentie + herkomst may change; refuses to overwrite a different existing value.
// Run through the approved lat12804 Directus admin workflow after board approval.

const base = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_TOKEN;
if (!base || !token) throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN are required');

const files = [
  {
    "id": "c4741987-3a74-44ae-986f-0f42bf1570df",
    "rs": 3420,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Michael Moosbrugger, met toestemming, via Schloss Gobelsburg. Bron: https://www.gobelsburg.at/galerie/"
  },
  {
    "id": "1b1495a3-daba-4010-a1ef-fa7513f77192",
    "rs": 3424,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Regina Hügli, met toestemming, via Schloss Gobelsburg. Bron: https://www.gobelsburg.at/galerie/"
  },
  {
    "id": "9fa208a9-87ff-478c-8f21-d7728be31e7f",
    "rs": 3429,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Michael Moosbrugger, met toestemming, via Schloss Gobelsburg. Bron: https://www.gobelsburg.at/galerie/"
  },
  {
    "id": "87385975-c72e-4975-94fb-587dc0d383f7",
    "rs": 3427,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Michael Moosbrugger, met toestemming, via Schloss Gobelsburg. Bron: https://www.gobelsburg.at/galerie/"
  },
  {
    "id": "af8a5f42-6ade-4093-b700-9d01d887246a",
    "rs": 3432,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Michael Moosbrugger, met toestemming, via Schloss Gobelsburg. Bron: https://www.gobelsburg.at/galerie/"
  },
  {
    "id": "0c6b0641-79e1-4591-a1fa-ab4602bffc69",
    "rs": 3442,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Weingut R&A Pfaffl KG, met toestemming, via Weingut R&A Pfaffl. Bron: https://pfaffl.at/"
  },
  {
    "id": "f1c0d153-6666-4c62-8e14-06362ab8173d",
    "rs": 3433,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Weingut R&A Pfaffl KG, met toestemming, via Weingut R&A Pfaffl. Bron: https://pfaffl.at/"
  },
  {
    "id": "8e96cdff-ba22-41c4-901e-3023b73ee4d5",
    "rs": 3441,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Weingut R&A Pfaffl KG, met toestemming, via Weingut R&A Pfaffl. Bron: https://pfaffl.at/"
  },
  {
    "id": "9c5c10db-e183-4235-8e32-f506f56291c6",
    "rs": 3437,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Weingut R&A Pfaffl KG, met toestemming, via Weingut R&A Pfaffl. Bron: https://pfaffl.at/"
  },
  {
    "id": "b2fffed2-d077-411d-b933-de72d46cb571",
    "rs": 3434,
    "licentie": "toestemming-wijnhuis",
    "herkomst": "Foto: Weingut R&A Pfaffl KG, met toestemming, via Weingut R&A Pfaffl. Bron: https://pfaffl.at/"
  }
];
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return (await response.json()).data;
}

// Check every file before writing anything.
const todo = [];
for (const f of files) {
  const before = await request('GET', `/files/${f.id}?fields=id,rs_ref,herkomst,licentie`);
  if (before.id !== f.id) throw new Error(`file ${f.id} not found`);
  if (before.rs_ref != null && String(before.rs_ref) !== String(f.rs)) {
    throw new Error(`file ${f.id}: rs_ref ${before.rs_ref} does not match RS ${f.rs}`);
  }
  for (const field of ['licentie', 'herkomst']) {
    if (before[field] != null && before[field] !== '' && before[field] !== f[field]) {
      throw new Error(`file ${f.id}: ${field} already has a different value; refusing to overwrite`);
    }
  }
  if (before.licentie !== f.licentie || before.herkomst !== f.herkomst) todo.push(f);
}

for (const f of todo) {
  await request('PATCH', `/files/${f.id}`, { licentie: f.licentie, herkomst: f.herkomst });
}
for (const f of files) {
  const after = await request('GET', `/files/${f.id}?fields=id,herkomst,licentie`);
  if (after.licentie !== f.licentie || after.herkomst !== f.herkomst) throw new Error(`file ${f.id}: verify failed`);
  console.log(`RS ${f.rs} ${f.id.slice(0, 8)} ok licentie=${after.licentie}`);
}
console.log(`patched=${todo.length} verified=${files.length}`);
