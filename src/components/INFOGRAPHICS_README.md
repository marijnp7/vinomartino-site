# Infographics — handleiding voor redactie

Twee herbruikbare componenten voor het Vinomartino infographic-systeem.

- **`<InfographicCard>`** — Cellar Card. Eén kolom, ideaal voor druiven, regio-profielen, klimaat en aroma's.
- **`<InfographicAtlas>`** — Editorial Atlas. Kaart-centraal, voor routes en regio-overzichten.

Volledige design-spec staat in [LAT-1107](https://app.paperclip.ing/LAT/issues/LAT-1107). Live preview: [`/infographics/`](https://vinomartino.com/infographics/) (noindex).

---

## Wanneer welke component?

| Inhoud                                  | Component                | Type / kind        |
|-----------------------------------------|--------------------------|--------------------|
| Druivenprofiel (radial + data)          | `<InfographicCard>`      | `type="grape"`     |
| Regio-profiel (Barolo, Etna DOC, …)     | `<InfographicCard>`      | `type="region"`    |
| Klimaat / terroir                       | `<InfographicCard>`      | `type="climate"`   |
| Aromaprofiel (3-rings wiel)             | `<InfographicCard>`      | `type="aroma"`     |
| Wijnroute (genummerde stops)            | `<InfographicAtlas>`     | `kind="route"`     |
| Regiokaart (zones, geen route)          | `<InfographicAtlas>`     | `kind="region"`    |
| Vergelijking van regio's op kaart       | `<InfographicAtlas>`     | `kind="comparison"` |
| Vergelijking druiven of regio's (3+)    | Meerdere `<InfographicCard>` in een grid | — |

> **Eén kicker-kleur per pagina.** Alleen bij directe vergelijking mag een grid drie kleuren tegelijk hebben.

---

## `<InfographicCard>` — Cellar Card

### Basisgebruik

```astro
---
import InfographicCard from '../components/InfographicCard.astro';
---

<InfographicCard
  type="grape"
  number="001"
  kicker="DRUIVENPROFIEL · NO. 001"
  title="Nebbiolo"
  subtitle="de mist van Barolo"
  contextLine="Piemonte · Barolo · Barbaresco · Roero"
  radial={{
    axes: [
      { label: 'Zuur',    value: 8 },
      { label: 'Tannine', value: 9 },
      { label: 'Alc',     value: 7 },
      { label: 'Body',    value: 8 },
      { label: 'Rijping', value: 9 },
    ],
  }}
  dataGrid={[
    { label: 'Hoogte',    value: '170–540 m' },
    { label: 'Bodem',     value: 'kalkmergel' },
    { label: 'Rijping',   value: '38 maanden' },
    { label: 'Drinkraam', value: '2030–2055' },
  ]}
  tastingNote={[
    'Rozen, teer en cherry, met een lange',
    'mineraal-spannende afdronk.',
  ]}
  source="Consorzio Tutela Barolo"
  variant="standalone"
  alt="Druivenprofiel van Nebbiolo: hoge tannine en zuur, rijping 38 maanden, drinkraam 2030–2055. Bron: Consorzio Tutela Barolo."
/>
```

### Alle props

| Prop          | Type / waarden                                                                                         | Verplicht |
|---------------|--------------------------------------------------------------------------------------------------------|-----------|
| `type`        | `'grape'` (rust) · `'region'` (burgundy) · `'climate'` (vine) · `'aroma'` (gold)                       | ✓ |
| `number`      | `string` — verschijnt als "NO. 001" rechts in kicker en links in footer                                 | ✓ |
| `kicker`      | `string` — hoofd-label boven titel, hoofdletters, mono                                                  | ✓ |
| `subKicker`   | `string` — optionele tweede regel onder kicker                                                          |   |
| `title`       | `string` — hoofdtitel, display italic                                                                   | ✓ |
| `subtitle`    | `string` — onder de titel, kleiner display                                                              |   |
| `contextLine` | `string` — bv. "Piemonte · Barolo · Barbaresco · Roero"                                                 |   |
| `radial`      | `{ axes: 5 × { label, value 0–10 } }` — exact 5 assen                                                   |   |
| `dataGrid`    | `{ label, value }[]` — 2-koloms grid, max 6 paren                                                       |   |
| `aromaWheel`  | `{ wedges: 8 × { label, primair?, secundair?, tertiair? }, centerLine1?, centerLine2? }` — exact 8 wedges |   |
| `tastingNote` | `string` of `string[]` — 1–2 regels italic body                                                         |   |
| `source`      | `string` — verplicht (bv. "Consorzio Tutela Barolo")                                          | ✓ |
| `domain`      | `string` — default `"VINOMARTINO.COM"`                                                                  |   |
| `variant`     | `'standalone'` · `'article-inline'` · `'sidebar'` · `'social-crop'`                                     |   |
| `alt`         | `string` — verplichte alt-tekst (zie sjabloon hieronder)                                                | ✓ |
| `class`       | `string` — extra CSS classes                                                                            |   |

### Varianten

| Variant            | Max breedte | Wanneer                                                  |
|--------------------|-------------|----------------------------------------------------------|
| `standalone`       | 880 px      | Hero of full-width strip in artikel                      |
| `article-inline`   | 480 px      | Inline in driekoloms artikel-grid                        |
| `sidebar`          | 320 px      | Aside-noot — geen radial; gebruik alleen `dataGrid`     |
| `social-crop`      | 1080 px     | Pinterest/IG portrait — gebruik 1:1 of crop SVG          |

Mobiel onder 360 px: radial wordt automatisch vervangen door horizontale balken (spec § 5.4).

### Alt-tekst sjabloon

```
{type-label} van {title}: {1–2 zin samenvatting met de kerncijfers}.
Bron: {source}.
```

Voorbeeld:
> "Druivenprofiel van Nebbiolo: hoge tannine en zuur, rijping 38 maanden, drinkraam 2030–2055. Bron: Consorzio Tutela Barolo."

---

## `<InfographicAtlas>` — Editorial Atlas

### Basisgebruik (wijnroute)

```astro
---
import InfographicAtlas from '../components/InfographicAtlas.astro';
---

<InfographicAtlas
  kind="route"
  kicker="WIJNROUTE · ETNA · 03 DAGEN"
  title="De noordhelling"
  subtitle="Randazzo · Solicchiata · Riposto"
  intro="Drie dagen rond de noordflank van de Etna: vijf wijnhuizen, 62 km, één eindeloze vulkaan."
  map={{
    viewBox: '0 0 960 640',
    bbox: ['37° 55′ N', '15° 18′ E', '37° 38′ S', '14° 50′ W'],
    layers: [
      { kind: 'zone',     d: 'M ...', color: 'burgundy', label: 'ETNA DOC' },
      { kind: 'waterway', d: 'M ...' },
      { kind: 'path',     d: 'M ...', color: 'burgundy', dashed: true, width: 2.5 },
      { kind: 'point',    x: 160, y: 260, type: 'pin-solid', number: 1, label: 'Randazzo' },
      { kind: 'point',    x: 360, y: 320, type: 'pin-solid', number: 2, label: 'Solicchiata' },
      // …
    ],
    compass: true,
    scaleBar: { kmTo: 10, pxLength: 80 },
    backgroundPattern: 'contour',
  }}
  legend={[
    { label: 'Etna DOC zone',     color: 'burgundy' },
    { label: 'Route',             color: 'burgundy' },
    { label: 'Rivier Alcantara',  color: 'vine' },
  ]}
  dataStrip={[
    { label: 'Stops',     value: '5' },
    { label: 'Afstand',   value: '62 km' },
    { label: 'Hoogte',    value: '600–900 m' },
    { label: 'Beste tijd', value: 'okt–nov' },
  ]}
  source="Consorzio Tutela Etna DOC"
  alt="Wijnroute kaart van Etna: drie dagen rond de noordhelling, vijf wijnhuizen tussen Randazzo en Riposto, 62 km. Bron: Consorzio Tutela Etna DOC."
/>
```

### Layer-types

| Layer       | Felden                                                                                       |
|-------------|----------------------------------------------------------------------------------------------|
| `zone`      | `d` (SVG path), `color`, `label?`                                                            |
| `path`      | `d`, `color`, `dashed?` (bool), `width?` (px)                                                |
| `point`     | `x`, `y`, `type` (`village`/`city`/`winery`/`summit`/`pin-solid`/`pin-outline`), `label?`, `number?` (1–9 voor genummerde route-stops) |
| `waterway`  | `d`, `label?`                                                                                |
| `callout`   | `x`, `y`, `w?`, `h?`, `kicker?`, `title`, `meta?`                                            |

> **Render-volgorde:** zones → waterways → paths → points → genummerde stops → callouts. Het component sorteert input automatisch; volgorde in `layers` boeit niet.

### Aspecten

- `aspect="portrait"` (default) — 1080×1350, direct Pinterest/IG.
- `aspect="landscape"` — 1600×900, voor article hero of OG-image.

---

## Spritesheet

Symbols staan op `/assets/vm-infographic-sprites.svg`. Gebruik in eigen SVG:

```html
<svg role="img" aria-label="Druiventros" width="24" height="24">
  <use href="/assets/vm-infographic-sprites.svg#sym-grape"/>
</svg>
```

Of voor genummerde marker:

```html
<svg width="20" height="20" style="color: #5A1A1F">
  <use href="/assets/vm-infographic-sprites.svg#mark-stop-num"/>
  <text x="10" y="13" text-anchor="middle"
        font-family="'JetBrains Mono'" font-size="10" fill="currentColor">3</text>
</svg>
```

Volledige catalogus zit in `vm-infographic-sprites-preview.svg` (LAT-1107 attachment) — niet voor productie.

---

## Regels in vier zinnen

1. **Eén kicker-kleur per pagina** (behalve in directe vergelijkings-grids).
2. **5 radial-assen, altijd.** Niet 4, niet 6.
3. **8 aroma-wedges, altijd.** Geen subset.
4. **`alt`-prop is verplicht** — gebruik het sjabloon hierboven.

Volledige typografische/kleur-regels: zie [LAT-1107 § 1–6](https://app.paperclip.ing/LAT/issues/LAT-1107).

---

## Pilot-aanpak

Voor v1 zetten we infographics handmatig in pagina's. Een content-collection voor herbruikbare infographics komt in een vervolg-ticket (open vraag uit LAT-1107 § 9.1).

Bij twijfel: post een comment op [LAT-1108](https://app.paperclip.ing/LAT/issues/LAT-1108).
