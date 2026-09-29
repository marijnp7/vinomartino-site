// LAT-12032: read-only. cta_blocks van de EN-vertalingen van Kaap- en Toscane-route.
const URL_ = process.env.DIRECTUS_URL || 'http://directus:8055';
const H = { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}` };
const r = await (await fetch(`${URL_}/items/routes_translations?filter[routes_id][_in]=4,10&fields=id,routes_id,languages_code,cta_blocks&limit=20`, { headers: H })).json();
console.log(JSON.stringify(r.data ?? r, null, 1));
