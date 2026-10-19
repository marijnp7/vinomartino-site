#!/usr/bin/env node
/**
 * LAT-14254 — Fratelli Aimasso: description + licentie 'pers' + herkomst op 12 wijnhuis-files.
 * Luca Aimasso (19-10, LAT-14247): IMG_-foto's zijn van het huis, alle overige van Mauro Gallo.
 * Hero 90f7bdba rendert anders "Foto: Fratelli Aimasso" (licentie null). Data 1-op-1 uit
 * /paperclip/design/vinomartino/beeld-wijnhuizen/fratelli-aimasso-diano-dalba/lat14247-files-patch.json.
 * Alleen deze ids, alleen deze drie velden. Idempotent; print readback.
 * Run (admin): lat12804-directus-schema-migrate.yml.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const WANT = {
  "90f7bdba-3930-4b8a-8bbc-9a9d05294f8b": {
    "description": "Herfstrode wijnranken bij zonsondergang in de wijngaarden van Fratelli Aimasso bij Diano d'Alba. Foto: Mauro Gallo / Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Mauro Gallo / Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "ae4562f5-98d0-4320-b421-bb75ae6dc221": {
    "description": "De familie Aimasso in de wijngaard, in zwart-wit. Foto: Mauro Gallo / Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Mauro Gallo / Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "cc831306-7f4e-4fd9-9be6-beba86d6e604": {
    "description": "Een tros Dolcetto tijdens de oogst bij Fratelli Aimasso. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "cbe0f8ef-de12-404c-8619-699d8a37dd05": {
    "description": "Houten vaten in de kelder van Fratelli Aimasso. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "b03bff15-3344-4bce-bf91-8227c23c8712": {
    "description": "Proefzaal onder een gewelf van baksteen bij Fratelli Aimasso. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "b9d33917-e855-40a7-9a12-fe9a36a32c98": {
    "description": "Vuurwerk boven de verlichte wijngaard van Fratelli Aimasso tijdens het zomerfeest. Foto: Mauro Gallo / Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Mauro Gallo / Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "dd4baabd-0ad4-4c03-aea8-9130db92d36f": {
    "description": "Vuurwerk boven de heuvel en de wijngaard van Fratelli Aimasso. Foto: Mauro Gallo / Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Mauro Gallo / Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "ddb3406e-0e54-4bb0-8de0-6360b963d426": {
    "description": "Herfst in de Langhe rond Diano d'Alba, met de Alpen aan de horizon. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "4c684f48-6e52-442b-87e5-c279aaeec730": {
    "description": "Flessenwand in de kelder van Fratelli Aimasso. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "5f1194c5-8553-4cbd-9022-bf8727cdae6b": {
    "description": "De Monviso boven de Langhe bij zonsondergang, gezien vanaf Fratelli Aimasso. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "ee217685-9f28-4555-8908-ed3f9bae6425": {
    "description": "Herfstige heuvels met wijngaarden rond Diano d'Alba. Foto: Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  },
  "b1ad2faf-87a4-4869-92c4-d7a57d27995e": {
    "description": "Wijngaardrijen van Fratelli Aimasso in herfstkleuren, met de Langhe erachter. Foto: Mauro Gallo / Cantina Fratelli Aimasso (https://www.aimasso.com)",
    "licentie": "pers",
    "herkomst": "Foto: Mauro Gallo / Cantina Fratelli Aimasso. Bron: https://www.aimasso.com (toestemming wijnhuis 19-10-2026, redactioneel gebruik, geen AI-bewerking)."
  }
};
const KEYS = ["description", "licentie", "herkomst"];
const FIELDS = "id," + KEYS.join(",");
const same = (a, w) => KEYS.every((k) => a?.[k] === w[k]);

let bad = 0, n = 0;
for (const [id, want] of Object.entries(WANT)) {
  const b = await api("GET", `/files/${id}?fields=${FIELDS}`);
  if (b.status !== 200) { console.log("GET", id, b.status); bad++; continue; }
  if (!same(b.j.data, want)) {
    const p = await api("PATCH", `/files/${id}`, want);
    if (p.status !== 200) { console.log("PATCH", id, p.status, JSON.stringify(p.j)?.slice(0, 200)); bad++; continue; }
  }
  const a = await api("GET", `/files/${id}?fields=${FIELDS}`);
  const ok = same(a.j?.data, want);
  if (!ok) bad++; else n++;
  console.log(ok ? "OK " : "BAD", JSON.stringify(a.j?.data));
}
console.log(`readback: ${n} ok, ${bad} fout`);
process.exit(bad ? 6 : 0);
