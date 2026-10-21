#!/usr/bin/env node
/**
 * LAT-14281 / LAT-14279 — title, description, licentie, herkomst op de 8 Clos Mogador-files
 * (wijnhuizen 50). Data 1-op-1 uit /paperclip/design/vinomartino/beeld-wijnhuizen/
 * clos-mogador-priorat/lat14279-files-patch.json. Herstelt ook twee titels die door een
 * NFD-bestandsnaam op "Clos Mogador: beeld van het wijnhuis" stonden.
 * Alleen deze ids, alleen deze vier velden. Idempotent; print readback.
 * Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const FIELDS = ["title", "description", "licentie", "herkomst"];
const DATA = {
 "52fe53d9-5fac-48f9-b85e-b2c1eae8dbb7": {
  "title": "Clos Mogador – Rijen eikenhouten vaten in de kelder van Clos Mogador",
  "description": "Rijen eikenhouten vaten in de kelder van Clos Mogador. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "ae58ce54-c124-4ed0-959e-750bbf618381": {
  "title": "Clos Mogador – Terrassen met wijnstokken en bloeiende kruiden in het voorjaar bij Clos Mogador, met de bergen van de Priorat erachter",
  "description": "Terrassen met wijnstokken en bloeiende kruiden in het voorjaar bij Clos Mogador, met de bergen van de Priorat erachter. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "0a86f57b-0a38-4b1b-a459-00f61c1209e3": {
  "title": "Clos Mogador – René Barbier vader en zoon aan de sorteertafel tijdens de oogst bij Clos Mogador",
  "description": "René Barbier vader en zoon aan de sorteertafel tijdens de oogst bij Clos Mogador. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "4e775890-ce29-4e30-a48a-a86828efe258": {
  "title": "Clos Mogador – Een muilezel ploegt tussen herfstrode wijnstokken bij Clos Mogador",
  "description": "Een muilezel ploegt tussen herfstrode wijnstokken bij Clos Mogador. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "67f6a9e1-fdfc-4d77-b457-a1e6e403df0f": {
  "title": "Clos Mogador – Steile wijngaardterrassen van Clos Mogador waar natuurlijk wordt gespoten",
  "description": "Steile wijngaardterrassen van Clos Mogador waar natuurlijk wordt gespoten. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "af66366f-98cd-47ba-a660-9b08cdc61ffb": {
  "title": "Clos Mogador – René Barbier tussen de foeders in de kelder van Clos Mogador, in zwart-wit",
  "description": "René Barbier tussen de foeders in de kelder van Clos Mogador, in zwart-wit. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "222b14e5-1178-4422-b440-df925ec512e1": {
  "title": "Clos Mogador – Bezoekers wandelen tussen klaprozen de wijngaard van Clos Mogador in",
  "description": "Bezoekers wandelen tussen klaprozen de wijngaard van Clos Mogador in. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 },
 "91b9b504-c42d-4882-971b-de10bcfca1a0": {
  "title": "Clos Mogador – René en Christian Barbier aan tafel met glazen wijn bij Clos Mogador",
  "description": "René en Christian Barbier aan tafel met glazen wijn bij Clos Mogador. Foto: Clos Mogador (https://www.closmogador.cat/)",
  "licentie": "toestemming-wijnhuis",
  "herkomst": "Foto: Clos Mogador. Bron: https://www.closmogador.cat/ (mailbijlagen Esther Juncosa, toestemming wijnhuis 19-10-2026; alleen VinoMartino en eigen redactionele social, geen doorverkoop, geen sublicentie, geen AI-bewerking)."
 }
};

let bad = 0;
for (const [id, want] of Object.entries(DATA)) {
  const get = async () => (await (await fetch(`${U}/files/${id}?fields=${FIELDS.join(",")}`, { headers: H })).json()).data;
  const cur = await get();
  if (!cur) { console.log(id, "NOT FOUND"); bad++; continue; }
  const diff = Object.fromEntries(FIELDS.filter(k => cur[k] !== want[k]).map(k => [k, want[k]]));
  let st = "unchanged";
  if (Object.keys(diff).length) {
    const r = await fetch(`${U}/files/${id}`, { method: "PATCH", headers: H, body: JSON.stringify(diff) });
    st = `PATCH ${r.status} [${Object.keys(diff).join(",")}]`;
  }
  const after = await get();
  const ok = FIELDS.every(k => after?.[k] === want[k]);
  if (!ok) bad++;
  console.log(id.slice(0, 8), st, "match", ok, "title:", after?.title);
}
console.log(bad ? `FAIL ${bad}` : `OK ${Object.keys(DATA).length}/${Object.keys(DATA).length}`);
process.exit(bad ? 1 : 0);
