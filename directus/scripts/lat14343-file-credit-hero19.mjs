#!/usr/bin/env node
/**
 * LAT-14343 — licentie 'pers' + herkomst op de hero-file van 19 partnerpagina's.
 * Sinds LAT-14220 (fallback "Foto: <huis>" weg) toont de hero geen credit als licentie/herkomst
 * leeg is; zelfde patroon als LAT-13876 (Lieser) en LAT-14254 (Aimasso).
 * Maker + site uit de file-description, datum uit beeld-wijnhuizen/<huis>/licentie.json.
 * Alleen deze ids, alleen licentie+herkomst. Idempotent; print readback.
 * Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const LIC = "pers";

// [file-id, huis, herkomst]
const ROWS = [
  ["a3687007-3697-488f-878b-aab1b6321481", "Bruna Grimaldi", "Foto: Bruna Grimaldi. Bron: https://www.brunagrimaldi.it (toestemming wijnhuis 08-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["84bfeeb9-4f19-46a9-8565-4dfe23826c4d", "Cellers de Scala Dei", "Foto: Cellers de Scala Dei. Bron: https://www.cellersdescaladei.com (toestemming wijnhuis 14-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["afe951bd-9adf-4cae-9e93-97c1c2a545fc", "Champagne René Geoffroy", "Foto: Champagne René Geoffroy. Bron: https://www.champagne-geoffroy.com (toestemming wijnhuis 16-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["114f8668-9b5e-4082-8bae-320cb7f23709", "Creation Wines", "Foto: Creation Wines. Bron: https://www.creationwines.com (toestemming wijnhuis 12-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["0f15f4f7-ed11-468d-a019-b5cc95711b0f", "De Tarczal", "Foto: De Tarczal. Bron: https://www.detarczal.com (toestemming wijnhuis 08-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["1b78925b-cb6a-44ec-8fae-b437f5a64570", "Bodegas Díez Mérito", "Foto: Bodegas Díez Mérito. Bron: https://www.diezmerito.com (toestemming wijnhuis 18-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["b164f8b1-e235-4cf3-873c-489fe0a879da", "Domaine Bertagna", "Foto: Domaine Bertagna. Bron: https://www.domainebertagna.com (toestemming wijnhuis 16-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["46e5003b-1fc7-4c8f-88a1-a77f24bcbbae", "Endrizzi", "Foto: Endrizzi. Bron: https://www.endrizzi.it (toestemming wijnhuis 15-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["e064e840-db6b-4545-9a4c-b1994286f5af", "Fontanafredda", "Foto: Fontanafredda. Bron: https://www.fontanafredda.it (toestemming wijnhuis 09-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["b0d2573f-3235-45db-8896-e963ff99f331", "Foradori", "Foto: Foradori. Bron: https://www.agricolaforadori.com (toestemming wijnhuis 16-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["8f5f4b5e-9213-4eba-b8d6-10d43a2bab5f", "Karpatská Perla", "Foto: Karpatská Perla. Bron: https://www.karpatskaperla.sk (toestemming wijnhuis 12-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["3c97b714-0596-403a-ae1d-47d3cf7ee571", "Montevertine", "Foto: Montevertine. Bron: https://www.montevertine.it (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["6cbb2409-52d5-4912-8e5c-483952232067", "Pio Cesare", "Foto: Pio Cesare. Bron: https://www.piocesare.it (toestemming wijnhuis 06-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["7317cc5c-e987-4e7e-80a6-19e53d7c4222", "Quinta do Crasto", "Foto: Quinta do Crasto. Bron: https://www.quintadocrasto.wine (toestemming wijnhuis 18-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["a2a64abb-86af-401d-903c-d95c90bf7899", "Weingut S.A. Prüm", "Foto: Weingut S.A. Prüm. Bron: https://www.sapruem.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["49cd1613-5422-4905-95ed-ffdd30edd7fe", "Weingut Alzinger", "Foto: Weingut Alzinger. Bron: https://alzinger.at (toestemming wijnhuis 18-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["b3b442d8-004c-4f99-801c-16e9272eb133", "Weingut Reinhold Haart", "Foto: Weingut Reinhold Haart. Bron: https://haart.de (toestemming wijnhuis 14-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["342141bd-3110-445e-835f-35e3e28a9dd3", "Weingut Machherndl", "Foto: Weingut Machherndl. Bron: https://www.machherndl.com (toestemming wijnhuis 15-10-2026, redactioneel gebruik, geen AI-bewerking)."],
  ["2343ecf8-10e4-400d-bb53-50b12338bb6e", "Weingut Selbach-Oster", "Foto: Weingut Selbach-Oster. Bron: https://www.selbach-oster.de (toestemming wijnhuis 15-10-2026, redactioneel gebruik, geen AI-bewerking)."],
];

let bad = 0, n = 0;
for (const [id, huis, herkomst] of ROWS) {
  const b = await api("GET", `/files/${id}?fields=id,licentie,herkomst`);
  if (b.status !== 200) { console.log("GET", id, b.status); bad++; continue; }
  if (b.j.data.licentie !== LIC || b.j.data.herkomst !== herkomst) {
    const p = await api("PATCH", `/files/${id}`, { licentie: LIC, herkomst });
    if (p.status !== 200) { console.log("PATCH", id, p.status, JSON.stringify(p.j)?.slice(0, 200)); bad++; continue; }
  }
  const a = await api("GET", `/files/${id}?fields=id,licentie,herkomst,modified_on`);
  const ok = a.j?.data?.licentie === LIC && a.j?.data?.herkomst === herkomst;
  if (!ok) bad++; else n++;
  console.log(ok ? "OK " : "BAD", huis, JSON.stringify(a.j?.data));
}
console.log(`readback: ${n} ok, ${bad} fout`);
process.exit(bad ? 6 : 0);
