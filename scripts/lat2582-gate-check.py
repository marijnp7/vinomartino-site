#!/usr/bin/env python3
"""i18n launch-gate voor de Engelse (/en/) kant van vinomartino.com.

De gate meet vijf onafhankelijke dimensies. Elke dimensie heeft een eigen bit in
de exit-code, zodat CI kan zien *welke* dimensie faalt zonder de output te
parsen:

    bit  waarde  dimensie
      0       1  nl-sentences  Nederlandse zinnen in de EN-body       (LAT-2908)
      1       2  technical     HTTP 200 + lang="en" + hreflang-trio
      2       4  nl-links      interne links van /en/ naar de NL-kant (LAT-2704)
      3       8  coverage      NL-pagina's zonder EN-tegenhanger
      4      16  nl-literals   ratio-blinde NL-literals               (LAT-2820)
      5      32  nl-nouns      losse NL inhoudswoorden                (LAT-4909)
             64  operationeel  er kon niets gemeten worden

Een run die op zowel nl-sentences als nl-links faalt geeft dus exit 5.

Geschiedenis
------------
LAT-2582 begon met een woord-drempel: tel Nederlandse stopwoorden en faal boven
een ratio. Dat gaf veel vals-positieven, omdat het corpus vol Romaanse
eigennamen staat ("Vin de Constance", "Lopez de Heredia", "Voor-Paardeberg").
LAT-2865 moest daarom "voor" uit de stopwoordenlijst halen en LAT-2838 koerste
op een handmatige uitsluitlijst van ~10 pagina's aan.

Een uitsluitlijst is de verkeerde fix: hij maakt precies die pagina's blind voor
echte toekomstige regressies. LAT-2908 verving de ratio daarom door een
**zin-criterium** (zie `scan()`). LAT-2911 heeft de vier overige dimensies
teruggebracht die in het originele script zaten maar bij de herbouw wegvielen.

LAT-3326 heeft de scope scherpgesteld: de gate bewaakt de PUBLIEKE /en/-kant.
Routes die `noindex` dragen (design-review-/QA-mockups) vallen buiten de drie
content-dimensies -- gemeten uit de pagina zelf, niet uit een lijst hier, zodat
de uitzondering vanzelf vervalt zodra de route publiek wordt. Zie `is_noindex`.

Waarom ratio-blinde literals een aparte dimensie zijn
-----------------------------------------------------
Een korte, herhaalde string (een affiliate-voetregel, een knoplabel) verdrinkt
in een verder Engelse pagina: geen enkele zin haalt de marker-drempel. De 28
Nederlandse disclosures op 11 /en/wijnroutes/-pagina's zaten destijds onder elke
ratio en waren onzichtbaar tot een gerichte scan. Daarom staan ze los in
NL_LITERALS.

Een literal-check die *niets* matcht is niet te onderscheiden van een geslaagde
gate. `--selftest` dekt dat af: het draait elke literal tegen de NL-tegenhanger,
waar hij per definitie hoort te staan. Vuurt een patroon daar niet, dan is het
patroon dood en niet de content schoon.

Waarom losse inhoudswoorden er nog een dimensie bij zijn (LAT-4909)
-------------------------------------------------------------------
Dimensie 1 vraagt om drie functiewoorden in één zin, dimensie 5 om een exacte
string die iemand na een incident heeft ingevoerd. Een kort label -- "Foto:",
"Kaart", "Noordelijke Rhône" -- haalt de eerste drempel nooit en staat per
definitie niet in de tweede. Dat gat liet LAT-4908 door. NL_NOUNS sluit het met
de spiegel van NL_MARKERS: alleen inhoudswoorden, ratio-blind, en met dezelfde
selftest-plicht op de NL-kant.

Gebruik
-------
    python3 scripts/lat2582-gate-check.py                       # live prod
    python3 scripts/lat2582-gate-check.py --base http://localhost:4321
    python3 scripts/lat2582-gate-check.py --dist dist           # lokale build
    python3 scripts/lat2582-gate-check.py --url /en/streken/    # losse pagina
    python3 scripts/lat2582-gate-check.py --json /tmp/gate.json # ruwe data
    python3 scripts/lat2582-gate-check.py --only nl-links,coverage
    python3 scripts/lat2582-gate-check.py --include-noindex     # ook mockups
    python3 scripts/lat2582-gate-check.py --selftest            # patroon-check

Env:
    NL_SENT_MIN   distinct Nederlandse markers per zin om te vlaggen (default 3)
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import glob
import html as htmllib
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "https://vinomartino.com"
SENT_MIN_DEFAULT = int(os.environ.get("NL_SENT_MIN", "3"))
UA = "lat2582-gate-check"

EXIT_SENTENCES = 1
EXIT_TECHNICAL = 2
EXIT_LINKS = 4
EXIT_COVERAGE = 8
EXIT_LITERALS = 16
EXIT_NOUNS = 32
EXIT_OPERATIONAL = 64

DIMENSIONS = ("nl-sentences", "technical", "nl-links", "coverage",
              "nl-literals", "nl-nouns")

# Bewust NL-only route-families. Wordt bij voorkeur uit src/lib/i18n.ts gelezen
# (`EN_MISSING_PREFIXES`), zodat de gate niet uit de pas loopt met de site zelf;
# deze tuple is alleen de fallback als dat bestand er niet is (los gedraaid).
NL_ONLY_PREFIXES_FALLBACK = ("/reizen-nareizen/", "/intern/", "/preview/")

# --------------------------------------------------------------------------- #
# dimensie 1 -- Nederlandse zinnen (LAT-2908)
# --------------------------------------------------------------------------- #
# Uitsluitend Nederlands-exclusieve markers. Homografen met het Engels, Frans,
# Spaans, Italiaans en Duits zijn bewust WEGGELATEN -- die maakten de oude
# woord-gate ruizig:
#   in, de, is, over, want, en, van, klein, met, te, we, u, men, die, als,
#   dan, of, kan, hier, was, wie, la, alle, nu, voor
# ("voor" ging eruit in LAT-2865 vanwege "Voor-Paardeberg" in de Paarl WO-area.)
#
# Houd deze lijst conservatief. Een woord hoort hier alleen thuis als het
# opzien zou baren in een Engelse zin.
NL_MARKERS = {
    "het", "een", "dat", "zijn", "maar", "ook", "niet", "naar", "heb", "heeft",
    "hebben", "wordt", "worden", "werd", "deze", "dit", "waar", "zelf", "veel",
    "meer", "nog", "wel", "geen", "bij", "uit", "door", "tot", "aan", "wat",
    "hoe", "waarom", "altijd", "nooit", "soms", "vaak", "elke", "elk",
    "andere", "eigen", "goed", "groot", "nieuw", "oude", "tussen", "zonder",
    "tegen", "onder", "boven", "achter", "omdat", "terwijl", "zoals", "toen",
    "daar", "hun", "haar", "hem", "ons", "onze", "jij", "wij", "zij", "ze",
    "je", "ik", "op", "om", "er", "kunnen", "moet", "moeten", "mag", "wil",
    "willen", "gaat", "gaan", "komt", "komen", "maakt", "maken", "doet",
    "doen", "zegt", "zeggen", "schreef", "reed", "rijden", "weet", "beginnen",
    "leren", "kennen", "gereden", "bezocht", "gesproken", "begint",
}

# --------------------------------------------------------------------------- #
# dimensie 6 -- losse NL inhoudswoorden (LAT-4909)
# --------------------------------------------------------------------------- #
# Waarom dit los staat van dimensie 1 en 5.
#
# LAT-4908 vond "Foto:" in de zichtbare tekst van een /en/-artikel. Geen van de
# bestaande dimensies zag het, en dat was geen toeval:
#
#   * dimensie 1 (nl-sentences) eist >=3 VERSCHILLENDE functiewoorden in één
#     zin. "Foto: CRDO Ribera del Duero" heeft er nul. Elk kort label -- een
#     bijschrift, een legenda-item, een knop, een tabelkop -- ligt structureel
#     onder die drempel. De drempel is juist (hij houdt Romaanse eigennamen
#     buiten), maar hij is blind voor losse woorden.
#   * dimensie 5 (nl-literals) matcht EXACTE, met de hand geankerde strings.
#     Die lijst groeit alleen achteraf, per incident, en dekt per definitie
#     nooit het volgende woord.
#
# NL_MARKERS is bewust alleen functiewoorden. Deze lijst is het spiegelbeeld:
# alleen INHOUDSWOORDEN, en een enkele treffer in de zichtbare tekst van een
# /en/-pagina is al fout -- ratio-blind, net als de literals.
#
# Selectie is gemeten, niet bedacht (meetscripts in LAT-4909). Uit de 2717
# distinct woorden in de korte labels van de NL-build zijn de woorden gehouden
# die aan drie eisen voldoen:
#
#   1. ze komen voor in de zichtbare tekst van de NL-build;
#   2. ze komen op GEEN ENKELE van de 295 /en/-pagina's voor -- een treffer is
#      dus per definitie een lek en geen vals-positief;
#   3. ze zijn eenduidig Nederlands. Homografen met het Engels/Frans/
#      Italiaans/Spaans ("brief", "slim", "luxe", "spring", "past", "basis")
#      en eigennaam-risico ("landen", "huis", "vallei", "dorp") zijn eruit
#      gelaten -- dezelfde les als LAT-2865, waar "voor" moest wijken voor
#      "Voor-Paardeberg".
#
# De waarde is de NL-route-familie waar het woord aantoonbaar staat; --selftest
# eist daar minstens één treffer, precies zoals bij NL_LITERALS. Alleen woorden
# met >=60% dekking BINNEN hun familie staan hier: bij een dunnere spreiding
# wordt de selftest-steekproef van SELFTEST_SAMPLE pagina's een dobbelsteen, en
# een flaky gate leert iedereen hem te negeren.
#
# Een woord toevoegen? Draai eerst eis 2 tegen de EN-build. Een woord dat daar
# al voorkomt hoort hier niet -- dan is het geen marker maar een leenwoord.
NL_NOUNS = {
    "accommodaties": "/accommodaties/",
    "artikelen": "/artikelen/",
    "bekijk": "/",
    "boek": "/",
    "druiven": "/",
    "druivenrassen": "/landen/",
    # LAT-4908 zelf. Het woord bestaat nog volop op de NL-kant (bijschriften en
    # herocredits, o.a. /colofon/), dus het is gewoon aantoonbaar meetbaar --
    # het hoefde alleen nooit naar /en/ te lekken.
    "foto": "/colofon/",
    "geboekt": "/streken/",
    "gerelateerde": "/wijnroutes/",
    "huurauto": "/affiliate-verklaring/",
    "kwaliteit": "/streken/",
    "mailadres": "/",
    "nieuwsbrief": "/artikelen/",
    "ontdek": "/",
    "overnachtingen": "/streken/",
    "proefnotities": "/",
    "proeverijen": "/affiliate-verklaring/",
    "redactiegids": "/artikelen/",
    "reistijd": "/landen/",
    "slapen": "/accommodaties/",
    "transparantie": "/voor-accommodaties/",
    "verblijven": "/accommodaties/",
    "wijnatlas": "/",
    "wijnkarakter": "/landen/",
    "wijnreisverhalen": "/artikelen/",
    "wijnroutes": "/",
    "wijngaard": "/over-ons/",
    "wijngaarden": "/",
    "wijnstreek": "/streken/",
    "wijnstreken": "/landen/",
    "streken": "/landen/",
    "zoeken": "/voor-accommodaties/",
    # LAT-4911 -- verhuisd uit NL_NOUNS_PENDING nadat de wijnhuis-/route-/kaart-
    # templates en de Directus-content Engels renderen op /en/. Anders dan de
    # families hierboven wijzen de zeldzame markers naar een exacte NL-pagina
    # (zelfde vorm als "foto": "/colofon/"): ze staan op een of twee pagina's, en
    # met een familie-prefix zou de selftest-steekproef (6 detailpagina's) ze
    # missen en DOOD melden terwijl de marker gewoon meetbaar is.
    "appellatie": "/streken/bourgogne/",
    "appellaties": "/artikelen/10-wijnhuizen-rhone-benchmark/",
    "bezienswaardigheid": "/wijnroutes/",
    "domein": "/streken/rioja/",
    "kaart": "/artikelen/10-wijnhuizen-rhone-benchmark/",
    "kelder": "/artikelen/waar-slapen-langhe-piemonte/",
    "ligging": "/accommodaties/bourgogne/",
    "noordelijke": "/artikelen/10-wijnhuizen-rhone-benchmark/",
    "oogst": "/artikelen/grower-champagne-2026-vroegste-oogst-bezoeken/",
    "streek": "/wijnhuizen/",
    "zuidelijke": "/artikelen/10-wijnhuizen-rhone-benchmark/",
}

# Markers die de meting WEL als bruikbaar aanwees, maar die op /en/ nog vuurden
# omdat er echte NL-labels op de EN-kant stonden. Elf van de twaalf zijn per
# LAT-4911 gefixt (template-, module- en Directus-kant) en staan nu gewoon in
# NL_NOUNS hierboven.
#
# Deze set blijft bestaan als landingsplaats: een marker die vandaag terecht
# vuurt op /en/ hoort hier, niet weggelaten. Een stil geschrapte marker is niet
# te onderscheiden van een marker die nooit is overwogen, en dan verdwijnt de
# bekende blinde vlek uit beeld. De gate print de inhoud bij elke run.
NL_NOUNS_PENDING: dict[str, str] = {
    # LAT-4911 -- 'wijnhuis' is op 129 van de 131 pagina's opgelost (het
    # wijnhuis-template rendert nu Engels). Wat overblijft zijn 2 artikelen met
    # de affiliate-disclosure van AffiliateBlockDisclosure.astro:
    #   "Reservering via de directe link naar het wijnhuis, VinoMartino
    #    ontvangt commissie, prijs voor jou identiek."
    # Die zin is disclosure-copy onder de M1-Optie-B-regels; een EN-formulering
    # vaststellen is een redactionele/compliance-keuze, geen technische. Dat
    # ligt bij de Lead Editor in LAT-4979. Zodra die EN-tekst er is, krijgt het
    # component een locale-prop en verhuist deze marker alsnog naar NL_NOUNS.
    #
    # Bewust hier en niet in NL_NOUNS: aanzetten zou de gate op ELKE PR rood
    # zetten voor een bekende, belegde copy-vraag, en een gate die altijd rood
    # staat leert iedereen hem te negeren.
    "wijnhuis": "/wijnhuizen/",
}

NOUN_RE = {w: re.compile(r"\b" + re.escape(w) + r"\b") for w in NL_NOUNS}

# --------------------------------------------------------------------------- #
# dimensie 5 -- ratio-blinde NL-literals (LAT-2820)
# --------------------------------------------------------------------------- #
# Elke literal die ooit op een EN-pagina is aangetroffen hoort hier, zodat hij
# niet stil terugkeert bij een merge. Gematcht op de RUWE HTML, niet op de
# zichtbare tekst: `kbd-navigeren` ankert bewust op de tag-grenzen
# (`</kbd> navigeren</span>`) zodat het woord alleen als los element-label telt
# en niet ergens midden in een Nederlandse volzin -- die vangt dimensie 1 al.
#
# `bron` wijst naar de NL-default in de repo, zodat een dood patroon te
# herleiden is. `nl_familie` is de NL-route-familie waar de literal hoort te
# staan; --selftest trekt daar pagina's uit de sitemap bij en eist minstens één
# treffer. Een familie is met opzet stabieler dan een vaste voorbeeld-URL: die
# laatste maakt de selftest rood zodra iemand precies díé pagina hernoemt.
#
# Let op: dit zijn DETAIL-pagina's, niet de index. De disclosures en
# kaart-bijschriften staan onder een streek-/wijnhuis-/routepagina; op
# /wijnroutes/ zelf staan ze niet.
NL_LITERALS = {
    "affiliate-disclosure": {
        "pattern": "als je hier boekt, kunnen wij een commissie",
        "bron": "src/lib/ui-strings.ts 'stay.disclosure.microcopy'",
        "nl_familie": "/wijnroutes/",
    },
    "affiliate-kort": {
        # &middot; komt op prod niet voor, alleen de kale ·; beide toegestaan
        # zodat een entity-wissel in de template de check niet stil doodt.
        "pattern": "Affiliate-links (?:&middot;|·) geen extra kosten",
        "regex": True,
        "bron": "src/lib/ui-strings.ts 'wijnhuis.staynear.disclosure'",
        "nl_familie": "/wijnhuizen/",
    },
    "cta-bekijk-boek": {
        "pattern": "Bekijk (?:&amp;|&) boek",
        "regex": True,
        "bron": "src/lib/ui-strings.ts 'streekkaart.cta.overnachten'",
        "nl_familie": "/streken/",
    },
    "kbd-navigeren": {
        # Ankert op de tag-grenzen (`</kbd> navigeren</span>`), zodat alleen het
        # losse toetsenbord-label telt en niet het woord midden in een NL-zin --
        # die vangt dimensie 1 al.
        "pattern": "> navigeren<",
        "bron": "src/components/SearchDialog.astro c.navigate",
        "nl_familie": "/",
    },
    "atlas-bijschrift": {
        "pattern": "Elke streek in échte geografie",
        "bron": "src/components/CountryRegionMap.astro",
        "nl_familie": "/landen/",
    },
    "cluster-40min": {
        "pattern": "Allemaal binnen ~40 min|binnen ~40 min rijden",
        "regex": True,
        "bron": "src/lib/ui-strings.ts 'acc.groepNote' / 'streekkaart.clusterNote'",
        "nl_familie": "/streken/",
    },
    "lege-staat-artikelen": {
        "pattern": "Geen artikelen voor deze filters",
        "bron": "src/lib/ui-strings.ts 'artikelen.index.filterEmpty.title'",
        "nl_familie": "/artikelen/",
    },
}

# Sluiten van een block-element beëindigt een zin, zodat copy uit twee
# naastgelegen elementen nooit tot één kunstmatige "zin" samensmelt.
BLOCK_END = re.compile(
    r"</(p|h1|h2|h3|h4|h5|h6|li|td|th|blockquote|figcaption|div|span|a)>", re.I
)
DROP = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.S | re.I)
WORD = re.compile(r"[A-Za-zÀ-ÿ']+")
SENT_SPLIT = re.compile(r"(?<=[.!?:;])\s+")
BLOCK_SEP = "\x00"
ASSET_RE = re.compile(r"\.(png|jpe?g|svg|webp|avif|xml|json|ico|css|js|txt|pdf)$", re.I)


# --------------------------------------------------------------------------- #
# noindex -- scope-grens van de gate (LAT-3326)
# --------------------------------------------------------------------------- #
# De gate bewaakt 100%-EN-dekking van de PUBLIEKE /en/-kant. Een handvol routes
# is design-review-/QA-mockup en draagt daarom `noindex` (LAT-1108/1110/1122):
# hun inhoud is bewust hard-coded NL en wordt niet vertaald -- dat staat als
# code-commentaar in de bronbestanden zelf. Die pagina's hielden de gate rood
# zonder dat er iets te repareren viel.
#
# Waarom dit GEEN uitsluitlijst is
# --------------------------------
# De module-docstring hierboven verwerpt uitsluitlijsten, en terecht: LAT-2838's
# lijst van ~10 paden maakte precies die pagina's blind voor echte regressies en
# moest met de hand kloppend gehouden worden. De uitzondering hieronder is van
# een andere soort -- hij staat niet in dit bestand maar wordt PER PAGINA UIT DE
# PAGINA ZELF GEMETEN. Haalt iemand `noindex={true}` weg, dan is de pagina
# publiek en meet de gate hem vanaf die build weer volledig, zonder dat hier
# iets bijgewerkt hoeft te worden. De uitzondering kan dus niet verjaren.
#
# Alleen de CONTENT-dimensies vervallen. `technical` (HTTP 200 + lang="en" +
# hreflang-trio) en `coverage` blijven gelden: een noindex-mockup mag stuk zijn
# qua vertaling, maar niet qua routing -- dat is hoe je merkt dat de EN-variant
# helemaal verdwenen is.
NOINDEX_RE = re.compile(
    r"<meta\b(?=[^>]*\bname=[\"']robots[\"'])(?=[^>]*\bcontent=[\"'][^\"']*\bnoindex\b)[^>]*>",
    re.I,
)
CONTENT_DIMENSIONS = ("nl-sentences", "nl-links", "nl-literals", "nl-nouns")

# Alleen voor `--selftest`. Dit is NADRUKKELIJK geen scope-lijst -- de gate
# leest scope uit de pagina, niet hieruit. Het zijn de routes waarvan we weten
# dat ze noindex horen te zijn, zodat de selftest een positief anker heeft:
# staan ze niet in de sitemap (dat doen ze niet, noindex-routes worden er niet
# in opgenomen), dan zou de live meting anders nooit één noindex-pagina zien en
# zou een kapotte `NOINDEX_RE` onopgemerkt blijven. Een fixture die 404 geeft is
# geen fout -- de route is dan weg. Een fixture die 200 geeft zonder noindex
# wél: dan is de route publiek geworden en hoort de gate hem te meten.
NOINDEX_SELFTEST_ROUTES = (
    "/en/infographics/",
    "/en/infographics/stijl-1-nebbiolo/",
    "/en/infographics/atlas-italie-interactief/",
)


def is_noindex(raw: str) -> bool:
    """True als de pagina een robots-meta met `noindex` draagt.

    Gemeten op de gerenderde HTML, niet op een pad-lijst -- zie de toelichting
    hierboven. `<meta name="robots" content="noindex, nofollow">` en de
    omgekeerde attribuutvolgorde tellen allebei; `content="index, follow"` niet.
    """
    return bool(NOINDEX_RE.search(raw))


def main_segment(raw: str) -> str:
    """De <main>-sectie, of de hele body als er geen <main> is."""
    m = re.search(r"<main\b[^>]*>(.*?)</main>", raw, re.S | re.I)
    return m.group(1) if m else raw


def visible_text(raw: str) -> str:
    """Tekst binnen <main>, met block-grenzen bewaard als separator."""
    seg = DROP.sub(" ", main_segment(raw))
    seg = BLOCK_END.sub(lambda mm: mm.group(0) + BLOCK_SEP, seg)
    seg = re.sub(r"<[^>]+>", " ", seg)
    return htmllib.unescape(seg)


def sentences(text: str):
    for block in text.split(BLOCK_SEP):
        block = re.sub(r"\s+", " ", block).strip()
        if not block:
            continue
        for s in SENT_SPLIT.split(block):
            s = s.strip()
            if s:
                yield s


def scan(raw: str, sent_min: int):
    """-> (word_hits, [(distinct_markers, sentence), ...]).

    Een pagina faalt als één zin >= sent_min *verschillende* NL-markers bevat.
    Verspreide Romaanse voorzetsels clusteren nooit zo binnen één zin; een echt
    onvertaalde Nederlandse zin altijd wel.
    """
    word_hits = 0
    flagged = []
    for s in sentences(visible_text(raw)):
        markers = [w for w in WORD.findall(s.lower()) if w in NL_MARKERS]
        word_hits += len(markers)
        distinct = set(markers)
        if len(distinct) >= sent_min:
            flagged.append((len(distinct), s))
    return word_hits, flagged


def find_literals(raw: str):
    """-> {key: aantal}. Alleen literals die daadwerkelijk voorkomen."""
    out = {}
    for key, spec in NL_LITERALS.items():
        if spec.get("regex"):
            n = len(re.findall(spec["pattern"], raw))
        else:
            n = raw.count(spec["pattern"])
        if n:
            out[key] = n
    return out


def find_nouns(raw: str):
    """-> {woord: [context, ...]}. Alleen woorden die echt voorkomen.

    Gemeten op de ZICHTBARE tekst, niet op de ruwe HTML: anders vuurt elk woord
    dat toevallig in een slug, een class-naam of een JSON-LD-blob staat
    ("/wijnroutes/", `data-foto`), en dat zijn geen zichtbare lekken. Daarin
    verschilt deze dimensie van nl-literals, die juist op de ruwe HTML ankert
    omdat die patronen op tag-grenzen leunen.
    """
    text = visible_text(raw)
    flat = re.sub(r"\s+", " ", text)
    low = flat.lower()
    out = {}
    for word, rx in NOUN_RE.items():
        spans = [m.start() for m in rx.finditer(low)]
        if spans:
            out[word] = [flat[max(0, i - 45):i + len(word) + 45].strip()
                         for i in spans[:3]]
    return out


def check_technical(raw: str, url: str, code: int, base: str):
    """-> lijst met problemen. Leeg == in orde.

    Correct voor /en/<pad> betekent: HTTP 200, <html lang="en">, en een compleet
    hreflang-trio waarbij en->zichzelf, nl->het NL-pad en x-default->het NL-pad
    wijst. Alleen "er staat érgens een hreflang" is te zwak: een verkeerd
    gerichte alternate is precies de fout die je wil vangen.
    """
    problems = []
    if code != 200:
        return [f"HTTP {code}"]

    lang = re.search(r"<html[^>]*\blang=\"([^\"]+)\"", raw, re.I)
    lang = (lang.group(1) if lang else "").lower()
    if lang != "en":
        problems.append(f'lang="{lang or "-"}"')

    alts = {
        h.lower(): href
        for h, href in re.findall(
            r"<link[^>]*\brel=\"alternate\"[^>]*\bhreflang=\"([^\"]+)\"[^>]*\bhref=\"([^\"]+)\"",
            raw,
            re.I,
        )
    }
    path = url[len(base):] if url.startswith(base) else url
    nl_path = re.sub(r"^/en(?=/|$)", "", path) or "/"
    want = {"en": base + path, "nl": base + nl_path, "x-default": base + nl_path}
    for key, expected in want.items():
        got = alts.get(key)
        if got is None:
            problems.append(f"hreflang={key} ontbreekt")
        elif got.rstrip("/") != expected.rstrip("/"):
            problems.append(f"hreflang={key} -> {got} (verwacht {expected})")
    return problems


def internal_nl_links(raw: str, base: str, nl_only_prefixes, nl_only_exact=()):
    """Interne links vanaf een /en/-pagina naar de NL-kant (LAT-2704).

    Chrome gaat er eerst uit, anders is de meting onbruikbaar ruizig:

    * alleen <main> telt -- de taalwisselaar, de site-header en de footer staan
      op iedere EN-pagina en wijzen met opzet naar NL;
    * <a> met een hreflang-attribuut is per definitie een taal-alternate (de
      wisselaar zelf draagt hreflang="nl") en dus geen lek;
    * /cdn-cgi/ is Cloudflare email-protection, geen content;
    * assets hebben geen taalvariant;
    * bewust NL-only paden horen NL te blijven -- hele families
      (`EN_MISSING_PREFIXES`) en losse paden (`EN_MISSING_EXACT_PATHS`).

    Zonder die filters meldt de check elke pagina en zegt hij dus niets.
    """
    body = DROP.sub(" ", main_segment(raw))
    out = []
    for tag, href in re.findall(r"(<a\b[^>]*\bhref=\"([^\"]+)\"[^>]*>)", body, re.I):
        if re.search(r"\bhreflang=", tag, re.I):
            continue
        if href.startswith(base):
            href = href[len(base):] or "/"
        if not href.startswith("/") or href.startswith("//"):
            continue
        path = href.split("#", 1)[0].split("?", 1)[0]
        if not path or path.startswith("/en/") or path == "/en":
            continue
        if path.startswith("/cdn-cgi/") or ASSET_RE.search(path):
            continue
        if is_nl_only(path, nl_only_prefixes, nl_only_exact):
            continue
        out.append(path)
    return out


# --------------------------------------------------------------------------- #
# ophalen
# --------------------------------------------------------------------------- #
def fetch(url: str):
    """-> (status, body). Gooit niets naar buiten; 404/500 zijn meetdata."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


def sitemap_urls(base: str):
    """Alle <loc>-URLs uit de sitemap(-index), als paden zonder host."""
    seen, out = set(), []
    todo = [base + "/sitemap-index.xml", base + "/sitemap.xml"]
    while todo:
        url = todo.pop(0)
        if url in seen:
            continue
        seen.add(url)
        code, body = fetch(url)
        if code != 200 or not body.strip():
            continue
        locs = re.findall(r"<loc>([^<]+)</loc>", body)
        if "<sitemapindex" in body:
            todo.extend(locs)
            continue
        for loc in locs:
            path = loc[len(base):] if loc.startswith(base) else loc
            if path.startswith("/") and path not in out:
                out.append(path)
    return out


def _same_path(a: str, b: str) -> bool:
    """Padvergelijking die `/x/` en `/x` als hetzelfde pad ziet."""
    return a.rstrip("/") == b.rstrip("/")


def is_nl_only(path: str, nl_only_prefixes, nl_only_exact=()) -> bool:
    """Spiegelt `isEnMissingPath` uit src/lib/i18n.ts (LAT-4918).

    Rangorde: een exact NL-only pad wint (fijnmazigste regel), daarna de
    familie-regel. Loopt deze functie uit de pas met de TS-kant, dan meet de
    gate iets anders dan de site doet -- houd ze samen.
    """
    if any(_same_path(path, p) for p in nl_only_exact):
        return True
    return any(path.startswith(p) for p in nl_only_prefixes)


def coverage_gaps(all_paths, nl_only_prefixes, nl_only_exact=()):
    """-> (en_paths, counted, missing, nl_only, orphan).

    `missing` is het echte dekkingsgat: een NL-pagina zonder EN-tegenhanger.
    `nl_only` valt uit de noemer, maar alleen zolang er echt geen EN-versie is;
    zodra die er komt doet de pagina gewoon weer mee.
    `orphan` (EN zonder NL-origineel) is geen gat, maar wel een scheve paring --
    zonder die regel kan "295 vs 295" een mismatch maskeren.
    """
    en_paths = {p[3:] if p != "/en" else "/"
                for p in all_paths if p.startswith("/en/") or p == "/en"}
    nl_paths = {p for p in all_paths if not (p.startswith("/en/") or p == "/en")}
    nl_only = sorted(p for p in nl_paths
                     if is_nl_only(p, nl_only_prefixes, nl_only_exact)
                     and p not in en_paths)
    counted = sorted(nl_paths - set(nl_only))
    missing = [p for p in counted if p not in en_paths]
    orphan = sorted(en_paths - nl_paths)
    return en_paths, counted, missing, nl_only, orphan


def _const_array(src: str, name: str):
    """De string-literals uit `const <name>... = [ ... ]`, of None als de
    declaratie ontbreekt. Het `const`-anker voorkomt dat een vermelding van de
    naam in commentaar of een docblock hierboven de match kaapt."""
    m = re.search(rf"\bconst\s+{name}[^=]*=\s*\[([^\]]*)\]", src)
    if not m:
        return None
    pairs = re.findall(r"'([^']+)'|\"([^\"]+)\"", m.group(1))
    return tuple(a or b for a, b in pairs)


def load_nl_only_prefixes(repo_root: str):
    """-> (prefixes, exact_paths, bron-label).

    Leest de NL-only-scope uit src/lib/i18n.ts, zodat de gate niet uit de pas
    loopt met de site zelf: `EN_MISSING_PREFIXES` (hele route-families) en
    `EN_MISSING_EXACT_PATHS` (losse paden binnen een verder vertaalde familie,
    LAT-4918). Valt terug op de constante als het bestand er niet is."""
    ts = os.path.join(repo_root, "src", "lib", "i18n.ts")
    try:
        with open(ts, encoding="utf-8") as fh:
            src = fh.read()
    except OSError:
        return NL_ONLY_PREFIXES_FALLBACK, (), "fallback (src/lib/i18n.ts niet gevonden)"
    prefixes = _const_array(src, "EN_MISSING_PREFIXES")
    if prefixes is None:
        return (NL_ONLY_PREFIXES_FALLBACK, (),
                "fallback (EN_MISSING_PREFIXES niet gevonden)")
    exact_missing = _const_array(src, "EN_MISSING_EXACT_PATHS") or ()
    exact_present = _const_array(src, "EN_PRESENT_EXACT_PATHS") or ()
    label = (f"src/lib/i18n.ts ({', '.join(prefixes)}"
             f"; losse NL-only paden: {', '.join(exact_missing) or 'geen'}"
             f"; uitzonderingen: {', '.join(exact_present) or 'geen'})")
    return prefixes, exact_missing, label


# --------------------------------------------------------------------------- #
# selftest
# --------------------------------------------------------------------------- #
SELFTEST_SAMPLE = 6


def run_selftest(base: str, workers: int) -> int:
    """Bewijs dat elke NL_LITERAL nog vuurt op de NL-kant.

    Een patroon dat nergens matcht maakt de gate stil groen: "0 treffers" van
    een kapot patroon en "0 treffers" van schone content zien er identiek uit.
    Deze test draait daarom de omgekeerde meting -- op de NL-kant MOET de
    literal er staan -- en bemonstert daarvoor echte pagina's uit de sitemap.
    """
    print("Selftest: vuren de NL_LITERALS-patronen nog op de NL-kant?\n")
    all_paths = sitemap_urls(base)
    if not all_paths:
        print("FAIL: sitemap leverde geen URLs op", file=sys.stderr)
        return EXIT_OPERATIONAL
    nl_paths = [p for p in all_paths if not (p.startswith("/en/") or p == "/en")]

    wanted = []
    for key, spec in NL_LITERALS.items():
        fam = spec["nl_familie"]
        if fam == "/":
            sample = ["/"]
        else:
            # De index zelf hoort erbij: lege-staat-copy (`Geen artikelen voor
            # deze filters`) staat juist op /artikelen/ en op geen enkele
            # detailpagina eronder.
            detail = [p for p in nl_paths if p.startswith(fam) and p != fam]
            sample = ([fam] if fam in nl_paths else []) + detail[:SELFTEST_SAMPLE]
        wanted.append((key, spec, sample))

    todo = sorted({p for _, _, sample in wanted for p in sample})
    with futures.ThreadPoolExecutor(workers) as ex:
        pages = dict(zip(todo, ex.map(lambda p: fetch(base + p), todo)))

    dead = []
    for key, spec, sample in wanted:
        firing = [(p, find_literals(pages[p][1]).get(key, 0)) for p in sample
                  if pages[p][0] == 200]
        firing = [(p, n) for p, n in firing if n]
        status = "ok  " if firing else "DOOD"
        where = f"{len(firing)}/{len(sample)} {spec['nl_familie']}-pagina's"
        example = f"  bv. {firing[0][0]}" if firing else ""
        print(f"  {status} {key:22} {where}{example}")
        if not firing:
            dead.append((key, spec, sample))

    print()
    failed = 0
    if dead:
        print(f"{len(dead)} patroon/patronen vuurden nergens. Dat is GEEN schone")
        print("content -- het betekent dat de gate op die literal blind is:")
        for key, spec, sample in dead:
            print(f"  - {key}: geen match op {len(sample)} pagina's onder "
                  f"{spec['nl_familie']} (bron: {spec['bron']})")
        failed = 1
    else:
        print("  -> elke literal is aantoonbaar meetbaar")

    failed |= selftest_nouns(base, nl_paths, workers)
    failed |= selftest_noindex(base, all_paths, workers)

    print()
    print(f"SELFTEST: {'NIET GESLAAGD' if failed else 'GESLAAGD'}")
    return 1 if failed else 0


def selftest_nouns(base: str, nl_paths, workers: int) -> int:
    """Bewijs dat elke NL_NOUNS-marker nog op de NL-kant staat (LAT-4909).

    Zelfde contract als de literal-selftest, en om dezelfde reden: "0 treffers
    op /en/" van een schone site en "0 treffers" van een marker die uit de
    NL-copy is wegvertaald zien er identiek uit. Vuurt een woord hier niet meer,
    dan is de marker dood gewicht -- haal hem weg of vervang hem, in plaats van
    hem stil te laten meeliften als bewijs van iets dat niet meer gemeten wordt.
    """
    print("\nSelftest: staan de NL_NOUNS-markers nog op de NL-kant? (LAT-4909)\n")
    if not nl_paths:
        print("  DOOD  geen NL-paden in de sitemap -- niets te bewijzen")
        return 1

    wanted = []
    for word, familie in NL_NOUNS.items():
        if familie == "/":
            sample = ["/"]
        else:
            detail = [p for p in nl_paths if p.startswith(familie) and p != familie]
            sample = ([familie] if familie in nl_paths else []) + detail[:SELFTEST_SAMPLE]
        wanted.append((word, familie, sample))

    todo = sorted({p for _w, _f, sample in wanted for p in sample})
    with futures.ThreadPoolExecutor(workers) as ex:
        pages = dict(zip(todo, ex.map(lambda p: fetch(base + p), todo)))

    dead = []
    for word, familie, sample in wanted:
        firing = [p for p in sample
                  if pages[p][0] == 200 and word in find_nouns(pages[p][1])]
        status = "ok  " if firing else "DOOD"
        example = f"  bv. {firing[0]}" if firing else ""
        print(f"  {status} {word:22} {len(firing)}/{len(sample)} "
              f"{familie}-pagina's{example}")
        if not firing:
            dead.append((word, familie, sample))

    print()
    if dead:
        print(f"{len(dead)} marker(s) vuurden nergens op de NL-kant. Dat is GEEN")
        print("schone content -- de gate is op die woorden blind:")
        for word, familie, sample in dead:
            print(f"  - {word}: geen match op {len(sample)} pagina's onder {familie}")
        return 1
    print("  -> elke marker is aantoonbaar meetbaar")
    return 0


def selftest_noindex(base: str, all_paths, workers: int) -> int:
    """Bewijs dat de noindex-detectie leeft, in beide richtingen (LAT-3326).

    De uitzondering slaat content-dimensies over. Een kapotte `NOINDEX_RE` is
    daarmee gevaarlijker dan een dode literal: matcht hij te breed, dan wordt de
    hele gate stil groen zonder iets te meten. De inverse meting hier is de
    ruwe HTML zelf -- staat het woord `noindex` in een robots-meta van een
    pagina terwijl `is_noindex()` False zegt, dan is de regex stuk en niet de
    pagina publiek.
    """
    print("\nSelftest: leeft de noindex-detectie nog? (LAT-3326)\n")
    en_paths = [p for p in all_paths if p.startswith("/en/") or p == "/en"]
    if not en_paths:
        print("  DOOD  geen /en/-paden in de sitemap -- niets te bewijzen")
        return 1
    # De sitemap bevat geen noindex-routes, dus zonder deze ankers ziet de
    # live meting alleen publieke pagina's en bewijst hij de ene helft niet.
    en_paths = en_paths + [p for p in NOINDEX_SELFTEST_ROUTES if p not in en_paths]

    with futures.ThreadPoolExecutor(workers) as ex:
        fetched = list(ex.map(lambda p: fetch(base + p), en_paths))

    # Ruwe, regex-onafhankelijke waarheid: draagt de pagina een robots-meta met
    # het woord noindex erin?
    raw_re = re.compile(r"<meta[^>]*robots[^>]*noindex|<meta[^>]*noindex[^>]*robots", re.I)
    marked, detected, measured = [], [], 0
    for path, (code, raw) in zip(en_paths, fetched):
        if code != 200 or not raw:
            continue
        measured += 1
        if raw_re.search(raw):
            marked.append(path)
        if is_noindex(raw):
            detected.append(path)

    if not measured:
        print("  DOOD  geen enkele /en/-pagina kon opgehaald worden")
        return 1

    missed = sorted(set(marked) - set(detected))
    extra = sorted(set(detected) - set(marked))
    print(f"  {measured} /en/-pagina's gemeten")
    print(f"  robots-meta met 'noindex' in de HTML : {len(marked)}")
    print(f"  door is_noindex() herkend            : {len(detected)}")

    if missed:
        print("  DOOD  is_noindex() zag deze noindex-pagina's NIET -- de regex "
              "is stuk:")
        for p in missed[:10]:
            print(f"          {p}")
        return 1
    if extra:
        print("  DOOD  is_noindex() vlagde pagina's ZONDER robots-noindex -- de "
              "regex matcht te breed en maakt de gate stil groen:")
        for p in extra[:10]:
            print(f"          {p}")
        return 1
    if detected and len(detected) == measured:
        print("  DOOD  ALLE /en/-pagina's gelden als noindex -- dan meet de "
              "gate de content-dimensies nergens meer")
        return 1
    # Ankers: een fixture die leeft maar niet als noindex geldt, is een echte
    # bevinding -- of de regex is stuk, of de route is publiek geworden en zou
    # gewoon gemeten moeten worden.
    live_anchors = [p for p, (code, raw) in zip(en_paths, fetched)
                    if p in NOINDEX_SELFTEST_ROUTES and code == 200 and raw]
    leaked = [p for p in live_anchors if p not in detected]
    if leaked:
        print("  DOOD  deze routes leven maar dragen geen robots-noindex meer:")
        for p in leaked:
            print(f"          {p}  -> publiek geworden, of NOINDEX_RE is stuk")
        return 1
    if not live_anchors:
        print(f"  ok    geen van de {len(NOINDEX_SELFTEST_ROUTES)} anker-routes "
              f"bestaat nog (404) -- werk NOINDEX_SELFTEST_ROUTES bij")

    if not detected:
        # Geen fout: als de mockup-routes weg zijn is de uitzondering inert.
        # Wel expliciet zeggen, anders leest 'groen' als 'bewezen'.
        print("  ok    0 noindex-routes op /en/ -- de uitzondering is inert; "
              "de unit-tests dekken de regex zelf af")
        return 0
    print(f"  ok    {len(detected)} noindex-route(s) herkend, "
          f"{measured - len(detected)} publieke pagina's blijven volledig "
          f"gemeten")
    for p in sorted(detected)[:10]:
        print(f"          {p}")
    return 0


# --------------------------------------------------------------------------- #
# rapport
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", "--base-url", dest="base", default=DEFAULT_BASE)
    ap.add_argument("--dist", help="scan een lokale build-directory i.p.v. HTTP")
    ap.add_argument("--url", action="append", help="scan alleen deze paden/URLs")
    ap.add_argument("--json", help="schrijf de ruwe per-pagina data hierheen")
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--sent-min", type=int, default=SENT_MIN_DEFAULT)
    ap.add_argument("--only", help=f"alleen deze dimensies: {','.join(DIMENSIONS)}")
    ap.add_argument("--include-noindex", action="store_true",
                    help="meet ook noindex-routes op de content-dimensies "
                         "(default: overgeslagen, zie LAT-3326)")
    ap.add_argument("--selftest", action="store_true",
                    help="controleer of de NL_LITERALS-patronen nog vuren")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if args.selftest:
        return run_selftest(base, args.workers)

    active = set(DIMENSIONS)
    if args.only:
        active = {d.strip() for d in args.only.split(",") if d.strip()}
        unknown = active - set(DIMENSIONS)
        if unknown:
            print(f"FAIL: onbekende dimensie(s): {', '.join(sorted(unknown))}",
                  file=sys.stderr)
            return EXIT_OPERATIONAL

    nl_only_prefixes, nl_only_exact, prefix_src = load_nl_only_prefixes(repo_root)

    print(f"Omgeving : {base}")
    if not args.dist:
        _, build = fetch(f"{base}/build-info.json")
        print(f"Build    : {build.strip() or '(onbekend)'}")
    print(f"NL-only  : {prefix_src}")
    print(f"Dimensies: {', '.join(d for d in DIMENSIONS if d in active)}\n")

    exit_code = 0
    pages = []  # (url_or_label, path, code, raw)

    # ---- verzamelen ------------------------------------------------------- #
    if args.dist:
        files = sorted(glob.glob(os.path.join(args.dist, "en", "**", "*.html"),
                                 recursive=True))
        if not files:
            print(f"FAIL: geen HTML onder {args.dist}/en", file=sys.stderr)
            return EXIT_OPERATIONAL
        for f in files:
            rel = os.path.relpath(f, args.dist)
            pages.append((rel, "/" + rel, 200,
                          open(f, encoding="utf-8", errors="replace").read()))
        if "technical" in active:
            print("(technical overgeslagen: --dist heeft geen HTTP-status)\n")
            active.discard("technical")
        if "coverage" in active:
            print("(coverage overgeslagen: --dist heeft geen sitemap)\n")
            active.discard("coverage")
    else:
        if args.url:
            en_urls = [u if u.startswith("http") else base + u for u in args.url]
            all_paths = [u[len(base):] for u in en_urls if u.startswith(base)]
            if "coverage" in active:
                print("(coverage overgeslagen: --url meet geen volledige sitemap)\n")
                active.discard("coverage")
        else:
            all_paths = sitemap_urls(base)
            if not all_paths:
                print("FAIL: sitemap leverde geen URLs op", file=sys.stderr)
                return EXIT_OPERATIONAL
            en_urls = [base + p for p in all_paths
                       if p.startswith("/en/") or p == "/en"]
            if not en_urls:
                print("FAIL: sitemap leverde geen /en/-URLs op", file=sys.stderr)
                return EXIT_OPERATIONAL

        with futures.ThreadPoolExecutor(args.workers) as ex:
            fetched = list(ex.map(fetch, en_urls))
        for url, (code, raw) in zip(en_urls, fetched):
            pages.append((url, url[len(base):], code, raw))

    ok_pages = [p for p in pages if p[2] == 200 and p[3]]
    if not ok_pages:
        print("FAIL: geen enkele pagina kon gemeten worden", file=sys.stderr)
        return EXIT_OPERATIONAL

    # ---- dekking ---------------------------------------------------------- #
    if "coverage" in active:
        en_paths, counted, missing, nl_only, orphan = coverage_gaps(
            all_paths, nl_only_prefixes, nl_only_exact)
        pct = 100.0 * (len(counted) - len(missing)) / max(1, len(counted))
        print(f"Dekking  : {len(en_paths)} EN vs {len(counted)} NL "
              f"sitemap-URLs ({pct:.1f}%)")
        if nl_only:
            print(f"  ({len(nl_only)} bewust NL-only, buiten de noemer: "
                  f"{', '.join(nl_only)})")
        for p in missing:
            print(f"  NL zonder EN-tegenhanger: {p}")
        # Een EN-pagina zonder NL-origineel is geen dekkingsgat, maar wel een
        # signaal dat de paar-vergelijking scheef staat -- zonder deze regel
        # zou 295 vs 295 een mismatch kunnen maskeren.
        for p in orphan:
            print(f"  EN zonder NL-origineel: /en{p}")
        if missing:
            exit_code |= EXIT_COVERAGE
        print()

    # ---- per-pagina metingen ---------------------------------------------- #
    rows = []
    for label, path, code, raw in pages:
        row = {"path": path, "code": code}
        if "technical" in active:
            row["technical"] = check_technical(raw, base + path, code, base)
        # Content-dimensies vervallen op noindex-routes (LAT-3326), tenzij
        # --include-noindex meedraait. `technical`/`coverage` blijven staan.
        row["noindex"] = bool(raw) and is_noindex(raw)
        if row["noindex"] and not args.include_noindex:
            active_page = active - set(CONTENT_DIMENSIONS)
        else:
            active_page = active
        if code == 200 and raw:
            if "nl-sentences" in active_page:
                hits, flagged = scan(raw, args.sent_min)
                row["word_hits"] = hits
                row["nl_sentences"] = [{"markers": n, "text": s} for n, s in flagged]
            if "nl-links" in active_page:
                row["nl_links"] = internal_nl_links(
                    raw, base, nl_only_prefixes, nl_only_exact)
            if "nl-literals" in active_page:
                row["literals"] = find_literals(raw)
            if "nl-nouns" in active_page:
                row["nouns"] = find_nouns(raw)
        rows.append(row)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(rows, fh, indent=1, ensure_ascii=False)
        print(f"(ruwe data geschreven naar {args.json})\n")

    # ---- noindex-uitzondering, altijd zichtbaar ---------------------------- #
    # Een stille uitzondering is een gat: "0 NL-zinnen" van schone content en
    # "0 NL-zinnen" omdat de pagina overgeslagen werd zien er anders identiek
    # uit. Daarom staat dit blok er ook als het aantal 0 is.
    skipped = [r["path"] for r in rows if r.get("noindex")]
    dims = ", ".join(d for d in CONTENT_DIMENSIONS if d in active)
    if args.include_noindex:
        print(f"Noindex  : {len(skipped)} pagina's, maar --include-noindex "
              f"staat aan -- ze worden volledig gemeten")
    elif skipped:
        print(f"Noindex  : {len(skipped)} pagina's buiten de content-dimensies "
              f"({dims}) -- LAT-3326")
        for p in sorted(skipped):
            print(f"  overgeslagen: {p}")
        print("  (draai --include-noindex om te zien wat daar verborgen zit)")
    else:
        print("Noindex  : 0 pagina's overgeslagen -- alle /en/-routes zijn "
              "publiek en volledig gemeten")
    print()

    # ---- technisch --------------------------------------------------------- #
    if "technical" in active:
        broken = [r for r in rows if r.get("technical")]
        print(f"Technisch: {len(rows) - len(broken)}/{len(rows)} OK "
              f"(HTTP 200 + lang=en + hreflang-trio)")
        for r in broken[:20]:
            print(f"  {r['path']}: {'; '.join(r['technical'])}")
        if len(broken) > 20:
            print(f"  ... en nog {len(broken) - 20} pagina's")
        if broken:
            exit_code |= EXIT_TECHNICAL
        print()

    # ---- Nederlandse zinnen ------------------------------------------------ #
    if "nl-sentences" in active:
        dutch = [r for r in rows if r.get("nl_sentences")]
        for r in dutch:
            print(f"NL   {r['path']}  (word-hits={r['word_hits']}, "
                  f"nl-sentences={len(r['nl_sentences'])})")
            for s in r["nl_sentences"]:
                print(f"       [{s['markers']}] {s['text'][:200]}")
        print(f"NL-zinnen: {len(dutch)}/{len(rows)} pagina's met Nederlandse "
              f"body-tekst (NL_SENT_MIN={args.sent_min})")
        if dutch:
            exit_code |= EXIT_SENTENCES
        print()

    # ---- interne NL-links -------------------------------------------------- #
    if "nl-links" in active:
        linky = [r for r in rows if r.get("nl_links")]
        total = sum(len(r["nl_links"]) for r in linky)
        print(f"NL-links : {len(linky)}/{len(rows)} pagina's met in totaal "
              f"{total} interne links naar de NL-kant (LAT-2704)")
        for r in linky[:20]:
            uniq = sorted(set(r["nl_links"]))
            print(f"  {r['path']} -> {', '.join(uniq[:5])}"
                  f"{' ...' if len(uniq) > 5 else ''}")
        if len(linky) > 20:
            print(f"  ... en nog {len(linky) - 20} pagina's")
        if linky:
            exit_code |= EXIT_LINKS
        print()

    # ---- NL-literals ------------------------------------------------------- #
    if "nl-literals" in active:
        per_key_pages, per_key_total = {}, {}
        for r in rows:
            for k, n in (r.get("literals") or {}).items():
                per_key_pages[k] = per_key_pages.get(k, 0) + 1
                per_key_total[k] = per_key_total.get(k, 0) + n
        found = sum(per_key_total.values())
        print(f"Literals : {found} treffers van ratio-blinde NL-literals")
        for k in NL_LITERALS:
            if per_key_pages.get(k):
                print(f"  {k}: {per_key_total[k]}x op {per_key_pages[k]} pagina's")
        if not per_key_pages:
            print("  geen -- alle bekende NL-literals zijn weg")
            print("  (draai --selftest om te bevestigen dat de patronen nog leven)")
        else:
            exit_code |= EXIT_LITERALS
        print()

    # ---- NL inhoudswoorden (LAT-4909) -------------------------------------- #
    if "nl-nouns" in active:
        per_word = {}
        for r in rows:
            for w, ctxs in (r.get("nouns") or {}).items():
                per_word.setdefault(w, []).append((r["path"], ctxs))
        total = sum(len(v) for v in per_word.values())
        print(f"Nouns    : {total} /en/-pagina's met een los NL inhoudswoord")
        # Bekende blinde vlek, altijd zichtbaar -- zie NL_NOUNS_PENDING.
        if NL_NOUNS_PENDING:
            print(f"  let op: {len(NL_NOUNS_PENDING)} marker(s) staan UIT zolang "
                  f"LAT-4911 loopt; die leks worden hier niet geteld:")
            for w, waar in NL_NOUNS_PENDING.items():
                print(f"    {w}: {waar}")
        if not per_word:
            print(f"  geen -- alle {len(NL_NOUNS)} markers zijn afwezig op /en/")
            print("  (draai --selftest om te bevestigen dat ze nog leven op NL)")
        else:
            for w in sorted(per_word, key=lambda x: -len(per_word[x])):
                pages = per_word[w]
                print(f"  {w!r} op {len(pages)} pagina's:")
                for path, ctxs in pages[:3]:
                    print(f"    {path}")
                    for c in ctxs[:1]:
                        print(f"      ...{c}...")
                if len(pages) > 3:
                    print(f"    (+{len(pages) - 3} meer)")
            exit_code |= EXIT_NOUNS
        print()

    # ---- slot -------------------------------------------------------------- #
    failed = [name for name, bit in (
        ("nl-sentences", EXIT_SENTENCES), ("technical", EXIT_TECHNICAL),
        ("nl-links", EXIT_LINKS), ("coverage", EXIT_COVERAGE),
        ("nl-literals", EXIT_LITERALS), ("nl-nouns", EXIT_NOUNS)) if exit_code & bit]
    print(f"gescand {len(rows)} /en/-pagina's")
    print(f"GATE: {'NIET GESLAAGD (' + ', '.join(failed) + ')' if failed else 'GESLAAGD'}"
          f"  [exit {exit_code}]")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
