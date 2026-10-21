#!/usr/bin/env node
/**
 * LAT-13812 — De Brief-welkomstmail krijgt een plek in `newsletter_issues`.
 *  1. Veld `kind` (dropdown `edition` | `welcome`, default `edition`). Een toekomstige loader
 *     filtert op kind = edition, zodat de welkomstmail nooit als archiefeditie rendert.
 *     (Main leest newsletter_issues nu nergens; het veld is de bron-afspraak.)
 *  2. Rij `issue-24-mist-boven-barolo` (verzonnen historie, REGEL 7) uit published: archived/draft.
 *  3. Welkomstmail als rij `welkomstmail` (kind=welcome, status=draft), tekst letterlijk uit de
 *     APPROVED-comment van Lead Editor op LAT-2622 (16-10 20:36, comment 744c37ca).
 *  4. content-writer policy (seed-runner) krijgt `create` op newsletter_issues, validation
 *     status=draft: Lead Editor kan bronrijen aanmaken, publiceren blijft een update.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin). Idempotent.
 */
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
async function api(method, path, body) {
  const r = await fetch(U + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
  return { status: r.status, ok: r.ok, j, text };
}
const C = "newsletter_issues";
const CW = "6b7abca9-c8a1-42de-9374-71491806308e"; // content-writer (content-agent, seed-runner)
const WELCOME_TITLE = "Welkom bij De Brief van VinoMartino";
const WELCOME_BODY = "Beste wijnreiziger,\n\nWelkom bij De Brief. Elke brief gaat over één wijnstreek: wat de grond en het klimaat met de wijn doen, welke adressen het onthouden waard zijn en hoe de reis zelf te regelen is.\n\nDe brief komt in het Nederlands, van Marijn, telkens als er een streek af is, niet volgens een vaste klok. Bij elk adres staat of Marijn er zelf was of dat het redactioneel is geselecteerd.\n\nWie niet wil wachten: op https://vinomartino.com/ staan de wijnroutes, wijnhuizen en overnachtingsgidsen. Eerdere brieven staan in het archief: https://vinomartino.substack.com/archive\n\nSommige links op de site zijn affiliate-links. Wie via zo'n link boekt, levert ons mogelijk een commissie op, zonder extra kosten.\n\nTot de volgende streek,\nMarijn\nVinoMartino, wijnreizen met karakter\n\nUitschrijven kan altijd via de link onderaan deze mail.";

// 1. veld kind
const f = await api("GET", `/fields/${C}/kind`);
if (f.ok) console.log("kind: bestaat al");
else {
  const r = await api("POST", `/fields/${C}`, {
    field: "kind", type: "string",
    schema: { default_value: "edition", is_nullable: false },
    meta: { interface: "select-dropdown", width: "half", required: true,
      note: "edition = archiefeditie (rendert); welcome = Substack-welkomstmail (rendert nooit). LAT-13812",
      options: { choices: [{ text: "Editie", value: "edition" }, { text: "Welkomstmail", value: "welcome" }] } },
  });
  if (!r.ok) { console.error(`kind FAIL ${r.status} ${r.text.slice(0, 300)}`); process.exit(2); }
  console.log("kind: aangemaakt");
}

// 2. issue-24 uit published
const st = await api("GET", `/fields/${C}/status`);
const choices = (st.j?.data?.meta?.options?.choices ?? []).map((c) => c.value);
console.log(`status-keuzes: ${JSON.stringify(choices)}`);
const target = choices.includes("archived") ? "archived" : "draft";
const i24 = (await api("GET", `/items/${C}?filter[slug][_eq]=issue-24-mist-boven-barolo&fields=id,status`)).j?.data?.[0];
if (!i24) console.log("issue-24: niet gevonden");
else if (i24.status === "published") {
  const r = await api("PATCH", `/items/${C}/${i24.id}`, { status: target });
  if (!r.ok) { console.error(`issue-24 FAIL ${r.status} ${r.text.slice(0, 300)}`); process.exit(3); }
  console.log(`issue-24: published -> ${target}`);
} else console.log(`issue-24: al ${i24.status}`);

// 3. welkomstmail. issue_number was meta.required; een welkomstmail heeft geen editienummer
//    (geen verzonnen nummer). Verplichting vervalt, `kind` draagt het onderscheid.
const inr = await api("GET", `/fields/${C}/issue_number`);
if (inr.j?.data?.meta?.required) {
  const r = await api("PATCH", `/fields/${C}/issue_number`, { meta: { required: false, note: "Verplicht voor kind = edition; leeg bij welcome. LAT-13812" } });
  if (!r.ok) { console.error(`issue_number FAIL ${r.status} ${r.text.slice(0, 300)}`); process.exit(6); }
  console.log("issue_number: required -> false");
} else console.log("issue_number: niet verplicht");
if (inr.j?.data?.schema && inr.j.data.schema.is_nullable === false) {
  const r = await api("PATCH", `/fields/${C}/issue_number`, { schema: { is_nullable: true } });
  if (!r.ok) { console.error(`issue_number nullable FAIL ${r.status} ${r.text.slice(0, 300)}`); process.exit(7); }
  console.log("issue_number: NOT NULL -> nullable");
} else console.log(`issue_number: is_nullable=${inr.j?.data?.schema?.is_nullable}`);
const w = (await api("GET", `/items/${C}?filter[slug][_eq]=welkomstmail&fields=id,kind,status,body`)).j?.data?.[0];
if (w) console.log(`welkomstmail: bestaat al (id ${w.id}, kind ${w.kind}, status ${w.status}, body ${w.body === WELCOME_BODY ? "identiek" : "AFWIJKEND"})`);
else {
  const r = await api("POST", `/items/${C}`, { slug: "welkomstmail", kind: "welcome", status: "draft", title: WELCOME_TITLE, body: WELCOME_BODY });
  if (!r.ok) { console.error(`welkomstmail FAIL ${r.status} ${r.text.slice(0, 300)}`); process.exit(4); }
  console.log(`welkomstmail: aangemaakt (id ${r.j.data.id})`);
}

// 4. create voor content-writer
const q = `/permissions?limit=-1&fields=id,action,validation&filter[policy][_eq]=${CW}&filter[collection][_eq]=${C}`;
const rows = (await api("GET", q)).j?.data ?? [];
if (rows.some((r) => r.action === "create")) console.log("create: bestaat al");
else {
  const r = await api("POST", "/permissions", { policy: CW, collection: C, action: "create", fields: ["*"], permissions: {}, validation: { status: { _eq: "draft" } } });
  if (!r.ok) { console.error(`create FAIL ${r.status} ${r.text.slice(0, 300)}`); process.exit(5); }
  console.log("create: toegekend");
}
console.log(`content-writer acties: ${(await api("GET", q)).j.data.map((r) => r.action).sort().join(",")}`);

const all = (await api("GET", `/items/${C}?limit=-1&fields=id,slug,kind,status,issue_number,title,publish_date`)).j.data;
for (const x of all) console.log("[row]", JSON.stringify(x));
