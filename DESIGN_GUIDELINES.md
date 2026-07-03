# VinoMartino — Beeldrichtlijnen (DESIGN_GUIDELINES)

Bron: `ANALYSE_VISUEEL_VINOMARTINO_2026-07-02.md`, goedgekeurd door Marijn. Vastgelegd onder [LAT-2012](/LAT/issues/LAT-2012) (VIS-STRAT-01).

Dit document is de gedeelde beeldrichtlijn voor **elke** agent die aan vinomartino.com werkt. Lees het naast `DESIGN_SPECS.md` (layout/tokens) en `PROJECT_BRIEF.md` § 3.0 (DAM → CMS → Site). Waar dit document en een ticket botsen, wint dit document tenzij Marijn expliciet iets anders vraagt.

Status: **vastgesteld en van kracht.** Het AI-beeldbeleid (§ 7) is op 2026-07-03 goedgekeurd namens Marijn (design/inhoud-mandaat) in [LAT-2012](/LAT/issues/LAT-2012). Alle secties zijn direct toepasbaar door elke agent.

Harde projectregels blijven gelden: alleen "Marijn" publiek (nooit achternaam of "Martin"), geen em-dashes in content, tekst via Directus, beeld via de DAM, bewijs = gerenderde prod-HTML.

---

## 1. Visuele richting — "Meegereisd"

De rode draad is **meegereisd**: het beeld moet ogen alsof de lezer met Marijn mee is geweest, niet alsof het van een stockbureau komt. Elk beeld beantwoordt impliciet één vraag: *"Was je er echt?"*

Principes:

- **Echt boven mooi.** Een iets scheve, eerlijke opname van het juiste moment verslaat een perfect stockbeeld van de verkeerde plek.
- **Bewijs boven decoratie.** Beeld staat er om een claim te staven (deze streek, dit huis, dit glas), niet om ruimte te vullen.
- **Eén reis, één stem.** Beelden binnen een pagina horen bij elkaar te horen: zelfde licht-familie, zelfde grading, zelfde afstandsgevoel. Geen collage van bronnen.
- **Nooit clipart, nooit generieke vulling.** Liever minder beeld dan een placeholder of een frame dat onder meerdere onderwerpen hergebruikt wordt.

---

## 2. Beeldtypes en Tiers

Beeld valt in twee tiers. De tier bepaalt de sourcing-eisen én het AI-beleid in § 7.

**Tier 1 — bewijsbeeld (fotografie, echt).**
Alles wat een concrete plek, mens of object bewijst:

- streek-/landschapsbeeld op streekpagina's,
- wijnhuis-portretten en de drieluik-beelden (plek / mens-of-handwerk / fles-of-glas), zie [LAT-2002](/LAT/issues/LAT-2002),
- accommodatie-/hotelbeeld,
- hero's van Tier 1-pagina's.

Tier 1 is **altijd echte fotografie**. Bron = DAM (of nieuw ingeschoten materiaal dat in de DAM wordt opgenomen). Geen AI, geen generieke stock.

**Tier 2 — redactioneel/illustratief.**
Niet-bewijzend beeld dat de redactie ondersteunt:

- kaarten en routekaarten,
- infographics (proces, tijdlijn, appellatie-schema),
- niet-fotorealistische illustraties in gravure-/lijnstijl (badges, sectiekoppen, marges).

Tier 2 mag gestileerd en getekend zijn. Hier is Atelier-AI-gebruik toegestaan, zie § 7.

---

## 3. Fotografiestijl (Tier 1)

- **Licht:** natuurlijk, warm, zijdelings. Voorkeur voor gouden-uur en zacht bewolkt. Geen harde middagzon met blauwe schaduwen als het te vermijden is. Let op: het juli-*reisarchief* in de DAM is grotendeels middaglicht; curated undated refs kúnnen wél gouden-uur zijn (check die eerst). Cape-opnames zijn een apart Dec/Jan-archief (zuidelijk-halfrond-zomer) — bijschrift-maand komt uit het DAM `Date`-veld, niet uit de reismaand.
- **Kader:** ruimte en context boven extreme close-ups; laat de plek zien. Mensen/handwerk mogen dichtbij (handen, vat, etiket).
- **Kleur:** aardetonen — terracotta, wijnrood, olijf/vine-groen, kalksteen-crème. Zie de grading-preset in § 5.
- **Compositie:** één duidelijk onderwerp per frame; horizon recht; geen zware vignetten of Instagram-filters.
- **Authenticiteit-tolerantie:** lichte imperfectie is toegestaan en zelfs gewenst; digitale "perfectie" die stock verraadt niet.

---

## 4. Verhoudingen (aspect ratios)

Vaste ratio's zodat elke agent hetzelfde uitsnijdt en de layout niet springt:

| Gebruik | Ratio | Opmerking |
| --- | --- | --- |
| Hero (pagina-breed) | 16:9 (desktop), 4:5 crop op mobiel | Onderwerp uit het uiterste kader houden i.v.m. mobiele crop |
| OG-/deelbeeld | 1.91:1 (1200×630) | Verplicht voor social; DAM-rendition apart |
| Drieluik-cel (wijnhuis) | 4:5 staand | Drie gelijke cellen, zie [LAT-2002](/LAT/issues/LAT-2002) |
| Inline body-figuur | 3:2 liggend | Standaard voor artikel-figuren |
| Kaart / infographic (Tier 2) | vrij, min. 4:3 | Leesbaarheid boven ratio |

Renditie-regels:

- Lever wat de layout vraagt via DAM-rendities; crop niet in de browser met CSS als het beeld ook echt versneden kan worden.
- **Committen, niet build-only.** Pagina-beeld dat via build-time download binnenkomt maar niet in de repo staat, geeft 404 op live. Commit de DAM-bytes onder de Directus-UUID-bestandsnaam (zie geheugen/LAT-1078-keten).
- **DAM ref ≠ Directus file-UUID.** Bij image-PATCH: importeer de DAM-ref → nieuwe UUID → PATCH die UUID. Ref en UUID verwisselen no-opt de swap stil.
- **EXIF-rotatie:** sommige `scr`/`lpr`-rendities tonen 90° gedraaid (o.a. ref 899). Bak de rotatie in de pixels (auto-orient) en verifieer rechtop vóór commit.

---

## 5. Grading-preset "Meegereisd Warm"

Doel: alle Tier 1-beelden binnen één warme, editoriale licht-familie brengen die past bij het palet uit `tokens.css` (burgundy, rust, vine, gold, paper). Toe te passen als lichte, niet-destructieve correctie — geen zware look.

Richtwaarden (vertaalbaar naar Lightroom/`darktable`/CLI):

- **Witbalans:** warm zetten, temp +200–400K richting amber; tint licht naar magenta weg van groen. Geen koele blauwzweem.
- **Belichting:** highlights −15 tot −25 (behoud lucht/kalksteen-detail), shadows +10 tot +20 (open schaduwen, geen dichtgelopen zwart).
- **Contrast:** zacht S-curve; zwartpunt licht opgetild (film-achtige voet), geen absolute 0.
- **Kleur (HSL):** groen richting olijf/`--vine` (verzadiging −10, hue naar geel); oranje/rood richting terracotta/`--rust` behouden of +5; blauw iets minder verzadigd zodat luchten niet knallen.
- **Verzadiging/vibrance:** globaal neutraal tot −5; vibrance +5 zodat aardetonen leven zonder poster-effect.
- **Korrel:** subtiele korrel toegestaan voor het meegereisd-gevoel; geen zichtbare ruis.
- **Vermijd:** HDR-tone-mapping, clarity/dehaze-overdaad, oranje-teal look, zware vignetten.

Doelpalet-ankers (voor visuele controle, niet om naartoe te forceren): `--paper #FAF5E9` als lichtste crème, `--rust #A14F2A` voor warme midtonen, `--vine #5C6B3F` voor groen, `--burgundy #5A1A1F` als diepste warme donker.

### 5a. De vaste preset als script (verplichte pipeline-stap)

De richtwaarden hierboven zijn vastgelegd als één deterministisch, idempotent script zodat elk beeld in de beeldbank exact dezelfde grading krijgt — ongeacht welke agent het uploadt. Dit is de kleur-grading preset uit [LAT-2007](/LAT/issues/LAT-2007) (VIS-BL-08).

- **Script:** `scripts/grade-meegereisd-warm.mjs` (sharp; preset-id `MeegereisdWarm-v1`). De parameters staan als `PRESET`-object in de kop en zijn 1-op-1 afgeleid van § 5.
- **Toepassen (in-place, bytes committen):** `node scripts/grade-meegereisd-warm.mjs public/images/<bestand>.jpg` — of een hele map. Auto-orient (§ 4) zit in het script.
- **Alleen rapporteren:** `--check` toont per beeld de RGB-verschuiving zonder te schrijven.
- **Idempotent:** het script schrijft `Software=MeegereisdWarm-v1` in de EXIF en slaat een reeds-gegradeerd beeld over. Gebruik `--force` alleen bij een preset-revisie.

**DAM-upload-checklist (Tier 1):** elke nieuwe upload doorloopt vóór commit: (1) auto-orient + juiste rendition/ratio (§ 4), (2) `grade-meegereisd-warm.mjs` draaien, (3) `--check` bevestigt een warme verschuiving (R−B stijgt), (4) bytes committen onder de Directus-UUID-bestandsnaam (§ 4). Bij een toekomstige look-wijziging: pas `PRESET` aan, verhoog de `PRESET_ID`-versie en regradeer met `--force`.

---

## 6. Verboden lijst

Nooit gebruiken op vinomartino.com:

- clipart, iconen-als-foto, of generieke "wijn"-stockbeelden;
- hetzelfde frame onder meerdere wijnhuizen/streken (templated gevoel — elk bewijsbeeld is uniek voor zijn onderwerp);
- byte-lege DAM-"Hero"-shells (verifieer dat `get_resource_all_image_sizes` een echte `original`/`scr` heeft vóór je een hero voorstelt);
- oranje-teal / zware Instagram-filters, HDR-look, zichtbare vignetten;
- gedraaide (niet-auto-georiënteerde) rendities;
- em-dashes in bijschriften/tekst; achternaam of "Martin" publiek;
- AI-gegenereerd fotorealisme voor Tier 1 (bewijsbeeld, wijnhuis-portret, hotel), zie § 7;
- beeld dat een plek/producent suggereert die het niet is (bijschrift moet eerlijk zijn: streekframe = als streek bijschriften, niet als "het huis").

---

## 7. AI-beeldbeleid (vastgesteld, van kracht)

> Goedgekeurd namens Marijn op 2026-07-03 (design/inhoud-mandaat) in [LAT-2012](/LAT/issues/LAT-2012). Van kracht voor alle agents.

**Toegestaan (Tier 2, niet-fotorealistisch):**

- kaarten en routekaarten,
- infographics (proces, tijdlijn, appellatie-schema's),
- niet-fotorealistische illustraties in gravure-/lijnstijl: outline-badge "Redactiegids", gravure-stijl sectiekoppen, marge-ornamenten.

**Verboden (Tier 1, altijd echt):**

- bewijsbeeld op streek-/artikelpagina's,
- wijnhuis-portretten en drieluik-beelden,
- hotel-/accommodatiebeeld,
- elke hero die als "echte plek" leest.

**"Atelier"-stijlprompt (voor toegestaan Tier 2-gebruik).**
Eén consistente huisstijl zodat AI-illustraties herkenbaar redactioneel zijn en nooit voor foto doorgaan:

```
Editorial engraving-style illustration, fine ink line work, cross-hatching,
single warm accent (terracotta #A14F2A) on cream paper (#FAF5E9),
antique wine-atlas / botanical-plate aesthetic, no photorealism,
no gradients that mimic photography, flat vintage print feel,
subject: {onderwerp}. Aspect {ratio}.
```

Toepassingsregel: elke AI-Tier 2-illustratie krijgt de outline-badge "Redactiegids" zodat de lezer ziet dat het redactionele duiding is, geen foto-bewijs.

**Waarom deze grens:** de merkwaarde zit in "meegereisd"-authenticiteit (§ 1). AI-fotorealisme op bewijsplekken ondermijnt precies dat vertrouwen; gestileerde Tier 2-illustratie doet dat niet omdat ze zichtbaar getekend is.

---

## 8. Sourcing Tier 1-beeld — voorstel fotografie-planning / DAM-ontsluiting

Aanleiding: de DAM is per **reis/streek** georganiseerd, niet per producent. Een producent-naam-zoekopdracht geeft 0 hits; per-wijnhuis-beeld bestaat daardoor nauwelijks (zie blokker op [LAT-2002](/LAT/issues/LAT-2002)). Omdat AI voor Tier 1 verboden is (§ 7) en generieke streekvulling op de verboden lijst staat (§ 6), is er een expliciete sourcing-route nodig.

**Vastgestelde redactieregel (direct toepasbaar, ontsluit de bestaande DAM):**

1. Vul de drieluik/Tier 1-slots alléén met een frame dat **uniek** is voor dat onderwerp en **eerlijk** te bijschriften. Een streek-/appellatieframe mag slot (1) "plek" vullen mits het bijschrift het als streek benoemt, niet als "dit huis".
2. Hergebruik nooit hetzelfde frame onder een tweede producent (§ 6).
3. Heeft een wijnhuis < 3 eerlijke, unieke frames? Toon 1 of 2. Nooit bijvullen. De component degradeert al zacht (LAT-2002).
4. Verifieer per DAM-ref dat er echte bytes zijn (geen Hero-shell) en oriëntatie klopt (§ 4) vóór selectie.

Dit ontsluit de DAM voor de huizen die wél bruikbare eigen frames hebben (bijv. fles/kelder) en voor streekgebonden slots, zonder de authenticiteitsregels te breken.

**Voorstel structurele opschaling (vergt beslissing/budget — marijn/board):**

- **Optie A — DAM-ontsluiting.** Voeg per Tier 1-producent een `producent`-tag + curatie-ronde toe aan de DAM zodat bestaande, verspreide frames vindbaar worden per huis. Goedkoop, maar levert alleen op wat al geschoten is.
- **Optie B — fotografie-planning per Tier 1-streek.** Plan een gerichte shoot-lijst per Tier 1-streek (plek/mens/fles per prioriteitshuis) op de eerstvolgende reis, met een minimale shotlist die dit document afdwingt. Levert echt bewijsbeeld, maar vergt reis/budget.
- **Optie C — hybride.** Nu Optie A (ontsluit wat er is) + Optie B als staande shotlist voor komende reizen.

**Aanbeveling:** Optie C. Ontsluit direct de bestaande DAM (regel hierboven) en leg een staande shotlist vast voor volgende reizen. Alleen het reis/budget-deel van Optie B vergt een board-beslissing.
