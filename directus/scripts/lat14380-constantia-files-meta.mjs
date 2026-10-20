#!/usr/bin/env node
/**
 * LAT-14380 — licentie/herkomst/description op 11 Constantia-accommodatiefiles
 * (Winelands Lodge RS3389-3393, Constantia Vista RS3394-3399), bron directus-ids.json (LAT-14379).
 * Herkomst met " | Bron:" (parser-valkuil LAT-14357). Idempotent; print readback.
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
const F = "id,licentie,herkomst,description";

// [file-id, rs-ref, herkomst, description]
const ROWS = [
  ["247c49f5-3c29-49d5-9136-a60ce6762c65", 3389, "Foto: Constantia Winelands Lodge | Bron: https://constantiawinelandslodge.com/ (toestemming accommodatie, Abigel Sheridan per mail 20-10-2026 (bijlagen); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Constantia Winelands Lodge van boven, tussen de bomen van de Constantia Vallei, met de Tafelberg aan de horizon. Foto: Constantia Winelands Lodge"],
  ["485ac914-be95-4321-8e55-37c94d773caa", 3390, "Foto: Constantia Winelands Lodge | Bron: https://constantiawinelandslodge.com/ (toestemming accommodatie, Abigel Sheridan per mail 20-10-2026 (bijlagen); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Het zwembad en de veranda van Constantia Winelands Lodge op een zonnige dag. Foto: Constantia Winelands Lodge"],
  ["5d9ecd5f-df12-4c79-8c49-f9a999490da1", 3391, "Foto: Constantia Winelands Lodge | Bron: https://constantiawinelandslodge.com/ (toestemming accommodatie, Abigel Sheridan per mail 20-10-2026 (bijlagen); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "De verlichte gevel van Constantia Winelands Lodge bij het zwembad, in de avond. Foto: Constantia Winelands Lodge"],
  ["6dddbb5d-73e7-4ce7-ae11-82e7f1ec87c3", 3392, "Foto: Constantia Winelands Lodge | Bron: https://constantiawinelandslodge.com/ (toestemming accommodatie, Abigel Sheridan per mail 20-10-2026 (bijlagen); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "De ontbijtruimte van Constantia Winelands Lodge, met uitzicht op het zwembad. Foto: Constantia Winelands Lodge"],
  ["dcfed4d1-c12a-4ded-b58c-60516a59ce78", 3393, "Foto: Constantia Winelands Lodge | Bron: https://constantiawinelandslodge.com/ (toestemming accommodatie, Abigel Sheridan per mail 20-10-2026 (bijlagen); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Een suite in Constantia Winelands Lodge met wenteltrap naar de bovenverdieping. Foto: Constantia Winelands Lodge"],
  ["22a1ac61-c658-4c31-82ab-ceed0f093f4a", 3394, "Foto: Constantia Vista Guest House | Bron: https://www.constantiavista.com/ (toestemming accommodatie, Ian Assin per mail 20-10-2026 (keuze van eigen site door VinoMartino); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Wijngaarden in de Constantia Vallei onder de bergen, het uitzicht vanaf Constantia Vista. Foto: Constantia Vista Guest House"],
  ["60227916-b4ed-4519-a893-1169e0e6731e", 3395, "Foto: Constantia Vista Guest House | Bron: https://www.constantiavista.com/ (toestemming accommodatie, Ian Assin per mail 20-10-2026 (keuze van eigen site door VinoMartino); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Het balkon van de penthouse van Constantia Vista, met een fles wijn en uitzicht over de Kaapse vlakte naar False Bay. Foto: Constantia Vista Guest House"],
  ["359671c3-7433-4d90-8a38-6c0fa088f619", 3396, "Foto: Constantia Vista Guest House | Bron: https://www.constantiavista.com/ (toestemming accommodatie, Ian Assin per mail 20-10-2026 (keuze van eigen site door VinoMartino); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Het hoofdhuis van Constantia Vista met het zwembad tussen het groen. Foto: Constantia Vista Guest House"],
  ["40b77b34-ed93-413e-bf37-9815e85a911a", 3397, "Foto: Constantia Vista Guest House | Bron: https://www.constantiavista.com/ (toestemming accommodatie, Ian Assin per mail 20-10-2026 (keuze van eigen site door VinoMartino); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Het Bay View-appartement van Constantia Vista, met keuken en uitzicht over de vallei. Foto: Constantia Vista Guest House"],
  ["cd6db51f-5d85-47ae-8724-49395ed8b36c", 3398, "Foto: Constantia Vista Guest House | Bron: https://www.constantiavista.com/ (toestemming accommodatie, Ian Assin per mail 20-10-2026 (keuze van eigen site door VinoMartino); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Het Vista-appartement van Constantia Vista, met glazen schuifdeuren naar het terras. Foto: Constantia Vista Guest House"],
  ["53ee5521-ff6f-4f9c-b9f5-0e8301f54be4", 3399, "Foto: Constantia Vista Guest House | Bron: https://www.constantiavista.com/ (toestemming accommodatie, Ian Assin per mail 20-10-2026 (keuze van eigen site door VinoMartino); geen AI-bewerking, geen doorverkoop/sublicentie; LAT-14375/LAT-14379)", "Zonsondergang boven de lichten van Kaapstad, gezien vanaf Constantia Vista. Foto: Constantia Vista Guest House"],
];

let bad = 0, n = 0;
for (const [id, ref, herkomst, description] of ROWS) {
  const b = await api("GET", `/files/${id}?fields=${F}`);
  if (b.status !== 200) { console.log("GET", id, b.status); bad++; continue; }
  const d = b.j.data;
  if (d.licentie !== LIC || d.herkomst !== herkomst || d.description !== description) {
    const p = await api("PATCH", `/files/${id}`, { licentie: LIC, herkomst, description });
    if (p.status !== 200) { console.log("PATCH", id, p.status, JSON.stringify(p.j)?.slice(0, 200)); bad++; continue; }
  }
  const a = await api("GET", `/files/${id}?fields=${F}`);
  const x = a.j?.data;
  const ok = x?.licentie === LIC && x?.herkomst === herkomst && x?.description === description;
  if (!ok) bad++; else n++;
  console.log(ok ? "OK " : "BAD", ref, id);
}
console.log(`readback: ${n} ok, ${bad} fout`);
process.exit(bad ? 6 : 0);
