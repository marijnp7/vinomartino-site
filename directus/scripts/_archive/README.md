# Gearchiveerde Directus-scripts

Scripts in deze map worden **niet meer uitgevoerd** en maken geen deel uit van een
onderhouden pad. Ze staan hier bewaard omdat ze laten zien hoe een collectie ooit
gevuld is, niet omdat je ze nog kunt draaien. Verwacht dat ze falen als je dat
alsnog probeert.

Het actieve opzetpad voor een schone Directus is en blijft:

```
npm run directus:setup
# = bootstrap-schema.mjs  →  seed-countries.mjs  →  migrate-blog-posts.mjs
```

---

## `set-content-hero-images.mjs` en `set-article-hero-images.mjs`

Gearchiveerd op **2026-07-23** via [LAT-2830](/LAT/issues/LAT-2830).

### Wat deden ze

Beide scripts zetten `hero_image` op Directus-items door een JPG uit
`public/images/` te uploaden naar `/files` en de resulterende file-id te PATCHen:

- `set-article-hero-images.mjs` (LAT-831, commit `e410cb7`, 2026-05-03) — alleen `articles`.
- `set-content-hero-images.mjs` (LAT-830, commit `04dd92d`, 2026-05-05) — de
  gegeneraliseerde versie voor `wijnhuizen`, `streken` en `routes`.

De beeldkeuze liep via een exacte `slug → bestandsnaam`-map met een
keyword-fallback (`KEYWORD_MAP`) en daarachter een vaste fallback op
`hello-world.jpg`.

### Waarom gearchiveerd

Elke beeldreferentie in beide scripts wijst naar een bestand dat niet meer
bestaat. Geverifieerd op 2026-07-23 tegen `public/images/`:

| script | referenties | ontbrekend |
| --- | --- | --- |
| `set-content-hero-images.mjs` | 19 | 19 (100%) |
| `set-article-hero-images.mjs` | 15 | 15 (100%) |

Ook de laatste redmiddelen ontbreken: de fallback `hello-world.jpg` bestaat niet,
dus zelfs het no-match-pad crasht.

De oorzaak is een schemawissel die buiten deze scripts om is gegaan. De oude,
losse bestandsnamen (`priorat-leisteen.jpg`, `piemonte-barolo.jpg`,
`etna-sicilie.jpg`, …) zijn verwijderd in commit `b6183ab` (LAT-1068, PR #23,
2026-06-01). Ruim een uur later introduceerde commit `4d7ebaa` (LAT-1074+1076,
PR #25) het huidige schema `landschap-*-001.jpg` / `wijnhuis-*-001.jpg`. De
scripts zijn daar nooit op bijgewerkt en hebben sinds mei 2026 geen enkele commit
meer gehad.

Ze zijn bovendien nergens aangeroepen: niet in `package.json`, niet in CI, niet in
een runbook. De enige verwijzingen repo-breed waren commentaarregels in
`seed-content-bodies.mjs` en `patch-image-field-relations.mjs`.

### Waarom niet herijkt

Herijken op het huidige schema zou betekenen dat 34 dode referenties opnieuw
gemapt worden op de ~24 beschikbare landschaps- en wijnhuisbeelden. De slugMaps
dateren van begin mei 2026, terwijl de contentset sindsdien flink gegroeid is;
het resultaat zou een set aannemelijk ogende maar willekeurig gekozen hero's
zijn. Een script dat hard faalt is in dit geval veiliger dan een script dat stil
het verkeerde beeld live zet.

### Als je ze tóch weer nodig hebt

Kopieer niet blind terug. Wat er dan moet gebeuren:

1. Vervang `KEYWORD_MAP` en alle `slugMap`-blokken in `COLLECTIONS` (respectievelijk
   `SLUG_IMAGE_MAP`) door namen die daadwerkelijk in `public/images/` staan.
2. Kies een fallback die bestaat — de huidige fallback `hello-world.jpg` is weg.
3. Draai eerst een controle die álle gerefereerde bestanden in één keer tegen de
   schijf legt en het volledige rapport toont, in plaats van af te breken op het
   eerste ontbrekende bestand (`uploadImage()` gooit nu op `existsSync`).
4. Controleer het resultaat op de pixels, niet op de bestandsnaam: een naam die
   plausibel klinkt zegt niets over wat er in het beeld staat.
