#!/usr/bin/env node
// LAT-14145: credit the existing RS 923 hero. Only two metadata fields may change.
// Run through the approved lat12804 Directus admin workflow after board approval.

const base = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_TOKEN;
if (!base || !token) throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN are required');

const id = '4767ceba-ecfc-40d3-871c-a28b5f7f8cb0';
const wanted = {
  herkomst: 'Foto: Marijn. Ürzig aan de Moezel, 9 juli 2022. Eigen opname, IMG_1469.jpeg, ResourceSpace 923; GPS 49.9812306, 7.0091750.',
  licentie: 'eigen',
};
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const path = `/files/${id}`;

async function request(method, suffix = '', body) {
  const response = await fetch(`${base}${path}${suffix}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return (await response.json()).data;
}

const fields = '?fields=id,rs_ref,herkomst,licentie';
const before = await request('GET', fields);
if (before.id !== id || String(before.rs_ref) !== '923') {
  throw new Error('File identity or ResourceSpace reference does not match RS 923');
}
for (const [field, value] of Object.entries(wanted)) {
  if (before[field] != null && before[field] !== '' && before[field] !== value) {
    throw new Error(`${field} already has a different value; refusing to overwrite`);
  }
}

if (Object.entries(wanted).some(([field, value]) => before[field] !== value)) {
  await request('PATCH', '', wanted);
}

const after = await request('GET', fields);
if (after.id !== id || String(after.rs_ref) !== '923' ||
    Object.entries(wanted).some(([field, value]) => after[field] !== value)) {
  throw new Error('File metadata readback does not match');
}
console.log(JSON.stringify({ id: after.id, rs_ref: after.rs_ref,
  herkomst: after.herkomst, licentie: after.licentie }));
