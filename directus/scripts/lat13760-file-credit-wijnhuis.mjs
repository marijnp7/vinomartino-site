#!/usr/bin/env node
/**
 * LAT-13760 — licentie + herkomst op de 26 wijnhuis-files van Pio Cesare (6) en Marziano Abbona (20)
 * uit de lat13343-import. Toestemming: /paperclip/design/vinomartino/beeld-wijnhuizen/
 * {pio-cesare,marziano-abbona}/licentie.json. Alleen deze ids, alleen deze twee velden.
 * Licentie: 'toestemming-wijnhuis' als die keuze bestaat, anders 'pers' (precedent LAT-13461).
 * Idempotent; print readback. Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const HERKOMST = {
  "Marziano Abbona": "Foto: Marziano Abbona. Bron: https://www.abbona.com (toestemming wijnhuis 08-10-2026, redactioneel gebruik, geen AI-bewerking).",
  "Pio Cesare": "Foto: Pio Cesare. Bron: https://www.piocesare.it (toestemming wijnhuis 06-10-2026, redactioneel gebruik, geen AI-bewerking)."
};
const IDS = {
  "Marziano Abbona": [
    "13258039-163c-4ab4-96f2-1fdf74c0c7d3",
    "40ff4f53-ed00-4902-831a-37e06475dd5b",
    "7cf61b66-f428-4b72-ac2f-b74344111e89",
    "0dcb8529-96cb-4a0a-b1f8-1a505973022e",
    "a21247c2-0570-4bed-9ec1-1310b4425145",
    "950454f4-3074-49cd-8453-932b2870b9c6",
    "694bc784-0ead-46c9-8c0b-9ebc624f0d8d",
    "11023dbe-fad4-4231-9cc8-4410e8655e6b",
    "5cca0392-e733-4996-b52f-97d92a046d58",
    "7886031e-d0c5-4e33-90e5-dca8f03a5ee2",
    "aebd004a-7dc7-4f67-a406-56d1a1229507",
    "b2d07131-0bde-4821-b5c9-56c161f1b4e7",
    "02ce13b8-730a-46f8-b65b-8d73f4b653a6",
    "995dcdc0-2c85-41fc-8cf9-e849ac12fd14",
    "a998408a-0e21-4589-8297-198d6642fb5d",
    "a4968fc1-3d1a-44b1-8a24-d9992d7b5e9a",
    "b29ad58b-bf10-463a-864a-cc5cc24da7dc",
    "e18aebf1-a40d-4176-b0c1-4d309d6f37f5",
    "e235f26c-19b6-43fd-b29f-d1f4cf1ca982",
    "3d2bf739-8ca1-4e8f-9d44-d3514b2f38fe"
  ],
  "Pio Cesare": [
    "3ffb9e51-3bc9-4df1-a64c-46d5d43c1f21",
    "57c7827a-e7ee-4940-b212-a41de7068d5f",
    "e9885ad7-fb94-46cf-9ebd-39c4959dbd7d",
    "bb400342-b8b7-414a-b4db-803ee5900fbe",
    "882e62ee-428f-419f-8f41-b8ae9f80940a",
    "221ade37-fbcb-424d-935c-3fb0a5aee0a6"
  ]
};
const FIELDS = "id,licentie,herkomst";

const f = await api("GET", "/fields/directus_files/licentie");
if (f.status !== 200) { console.error("GET field licentie:", f.status); process.exit(2); }
const choices = (f.j.data.meta?.options?.choices ?? []).map((c) => c.value);
console.log("licentie choices:", JSON.stringify(choices));
const LIC = !choices.length || choices.includes("toestemming-wijnhuis") ? "toestemming-wijnhuis" : "pers";
if (choices.length && !choices.includes(LIC)) { console.error(`'${LIC}' geen geldige keuze`); process.exit(3); }
console.log("licentie ->", LIC);

let bad = 0, n = 0;
for (const [huis, ids] of Object.entries(IDS)) {
  const want = { licentie: LIC, herkomst: HERKOMST[huis] };
  for (const id of ids) {
    const b = await api("GET", `/files/${id}?fields=${FIELDS}`);
    if (b.status !== 200) { console.log("GET", id, b.status); bad++; continue; }
    if (b.j.data.licentie !== want.licentie || b.j.data.herkomst !== want.herkomst) {
      const p = await api("PATCH", `/files/${id}`, want);
      if (p.status !== 200) { console.log("PATCH", id, p.status, JSON.stringify(p.j)?.slice(0, 200)); bad++; continue; }
    }
    const a = await api("GET", `/files/${id}?fields=${FIELDS}`);
    const ok = a.j?.data?.licentie === want.licentie && a.j?.data?.herkomst === want.herkomst;
    if (!ok) bad++; else n++;
    console.log(ok ? "OK " : "BAD", JSON.stringify({ huis, ...a.j?.data }));
  }
}
console.log(`readback: ${n} ok, ${bad} fout`);
process.exit(bad ? 6 : 0);
