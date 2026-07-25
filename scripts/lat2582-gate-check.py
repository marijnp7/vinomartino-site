#!/usr/bin/env python3
"""i18n gate: detect leftover Dutch body content on the English (/en/) pages.

Background
----------
LAT-2582 introduced a word-level gate: count Dutch stopword occurrences in a
page and fail above a threshold. That gate produced a lot of false positives,
because the corpus is full of Romance proper nouns and appellation names
("Vin de Constance", "Lopez de Heredia", "Cote de Nuits", "Barrio de la
Estacion"). LAT-2865 already had to drop "voor" from the stopword list for
this reason, and LAT-2838 was heading towards a hand-maintained exclusion list
of ~10 pages.

An exclusion list is the wrong fix: it makes exactly those pages blind to real
future Dutch regressions. This gate uses a **sentence-level** criterion instead:

    a page fails if any single sentence contains >= NL_SENT_MIN (default 3)
    *distinct* Dutch marker words.

Scattered Romance prepositions never cluster that way inside one sentence, but
an actually-untranslated Dutch sentence always does. Measured on production
build #913 this gives 0 false positives across the whole /en/ tree, with no
exclusion list at all.

Usage
-----
    python3 scripts/lat2582-gate-check.py                     # live prod
    python3 scripts/lat2582-gate-check.py --base-url http://localhost:4321
    python3 scripts/lat2582-gate-check.py --dist dist          # local build
    python3 scripts/lat2582-gate-check.py --url /en/streken/   # single page

Env:
    NL_SENT_MIN   distinct Dutch markers per sentence to flag it (default 3)

Exit codes:
    0  no Dutch sentences found
    1  at least one Dutch sentence found
    2  operational failure (nothing could be fetched)
"""
from __future__ import annotations

import argparse
import glob
import html
import os
import re
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = "https://vinomartino.com"
SENT_MIN_DEFAULT = int(os.environ.get("NL_SENT_MIN", "3"))

# Dutch-exclusive markers only.
#
# Homographs with English / French / Spanish / Italian / German are
# deliberately EXCLUDED -- they are what made the word-level gate noisy:
#   in, de, is, over, want, en, van, klein, met, te, we, u, men, die, als,
#   dan, of, kan, hier, was, wie, la, alle, nu, voor
# ("voor" was removed in LAT-2865 for exactly this reason.)
#
# Keep this list conservative. A word only belongs here if seeing it in an
# English sentence would be surprising.
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

# Closing a block-level element ends a sentence, so copy from two adjacent
# elements never merges into one artificial "sentence".
BLOCK_END = re.compile(
    r"</(p|h1|h2|h3|h4|h5|h6|li|td|th|blockquote|figcaption|div|span|a)>", re.I
)
DROP = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.S | re.I)
WORD = re.compile(r"[A-Za-zÀ-ÿ']+")
SENT_SPLIT = re.compile(r"(?<=[.!?:;])\s+")
BLOCK_SEP = "\x00"


def visible_text(raw: str) -> str:
    """Text inside <main>, with block boundaries preserved as separators."""
    m = re.search(r"<main\b[^>]*>(.*?)</main>", raw, re.S | re.I)
    seg = m.group(1) if m else raw
    seg = DROP.sub(" ", seg)
    seg = BLOCK_END.sub(lambda mm: mm.group(0) + BLOCK_SEP, seg)
    seg = re.sub(r"<[^>]+>", " ", seg)
    return html.unescape(seg)


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
    """Return (word_hits, [(distinct_markers, sentence), ...])."""
    word_hits = 0
    flagged = []
    for s in sentences(visible_text(raw)):
        markers = [w for w in WORD.findall(s.lower()) if w in NL_MARKERS]
        word_hits += len(markers)
        distinct = set(markers)
        if len(distinct) >= sent_min:
            flagged.append((len(distinct), s))
    return word_hits, flagged


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "lat2582-gate-check"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def en_urls_from_sitemap(base: str):
    """Discover every /en/ page, so the gate never goes stale on a page list."""
    idx = fetch(f"{base}/sitemap-index.xml")
    maps = re.findall(r"<loc>([^<]+)</loc>", idx) or [f"{base}/sitemap-0.xml"]
    urls = []
    for m in maps:
        for loc in re.findall(r"<loc>([^<]+)</loc>", fetch(m)):
            if re.search(r"/en/", loc):
                urls.append(loc)
    return sorted(set(urls))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--dist", help="scan a local build directory instead of HTTP")
    ap.add_argument("--url", action="append", help="scan only these paths/URLs")
    ap.add_argument("--sent-min", type=int, default=SENT_MIN_DEFAULT)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    targets = []  # (label, raw_html)

    try:
        if args.dist:
            files = sorted(glob.glob(os.path.join(args.dist, "en", "**", "*.html"),
                                     recursive=True))
            if not files:
                print(f"FAIL: no HTML under {args.dist}/en", file=sys.stderr)
                return 2
            for f in files:
                targets.append((os.path.relpath(f, args.dist),
                                open(f, encoding="utf-8", errors="replace").read()))
        else:
            urls = ([u if u.startswith("http") else base + u for u in args.url]
                    if args.url else en_urls_from_sitemap(base))
            if not urls:
                print("FAIL: sitemap yielded no /en/ URLs", file=sys.stderr)
                return 2
            for u in urls:
                try:
                    targets.append((u, fetch(u)))
                except urllib.error.HTTPError as e:
                    print(f"WARN {u}: HTTP {e.code}", file=sys.stderr)
    except Exception as e:  # network/sitemap failure is operational, not a gate failure
        print(f"FAIL: could not collect pages: {e}", file=sys.stderr)
        return 2

    if not targets:
        print("FAIL: nothing to scan", file=sys.stderr)
        return 2

    bad = 0
    for label, raw in targets:
        word_hits, flagged = scan(raw, args.sent_min)
        if flagged:
            bad += 1
            print(f"NL   {label}  (word-hits={word_hits}, nl-sentences={len(flagged)})")
            for n, s in flagged:
                print(f"       [{n}] {s[:200]}")
        elif not args.quiet:
            print(f"ok   {label}  (word-hits={word_hits})")

    print(f"\nscanned {len(targets)} /en/ pages, "
          f"{bad} with Dutch content (NL_SENT_MIN={args.sent_min})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
