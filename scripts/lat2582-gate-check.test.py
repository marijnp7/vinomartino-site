#!/usr/bin/env python3
"""Negatieve tests voor de i18n-gate (LAT-2911).

Waarom deze tests bestaan
-------------------------
De gate stond op prod op "alles groen" voor drie van de vijf dimensies. Groen
is pas informatie als de check ook rood KAN worden -- een dimensie die door een
kapotte regex nooit aanslaat, is niet te onderscheiden van schone content. Dat
is precies hoe de literal-dimensie eerder stilviel (zie --selftest).

Elke test hieronder voedt de gate dus een bewust kapot fragment en eist dat hij
aanslaat, plus een schoon fragment en eist dat hij zwijgt.

Draaien:  python3 scripts/lat2582-gate-check.test.py
"""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "gate", os.path.join(_HERE, "lat2582-gate-check.py"))
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)

BASE = "https://vinomartino.com"
NL_ONLY = ("/reizen-nareizen/", "/intern/", "/preview/")


def page(head="", body=""):
    return f'<html lang="en"><head>{head}</head><body><main>{body}</main></body></html>'


def alts(path):
    nl = path[3:] if path.startswith("/en") else path
    return (f'<link rel="alternate" hreflang="en" href="{BASE}{path}">'
            f'<link rel="alternate" hreflang="nl" href="{BASE}{nl}">'
            f'<link rel="alternate" hreflang="x-default" href="{BASE}{nl}">')


class TestSentences(unittest.TestCase):
    def test_dutch_sentence_is_flagged(self):
        raw = page(body="<p>De plek waar je slaapt bepaalt hoeveel je per dag "
                        "kunt bezoeken zonder te haasten.</p>")
        _, flagged = gate.scan(raw, 3)
        self.assertTrue(flagged, "onvertaalde NL-zin moet aanslaan")

    def test_english_page_is_clean(self):
        raw = page(body="<p>The place where you sleep determines how much you "
                        "can visit each day without rushing.</p>")
        _, flagged = gate.scan(raw, 3)
        self.assertEqual(flagged, [])

    def test_romance_proper_nouns_do_not_trip(self):
        # Dit is de vals-positief die de oude woord-gate onbruikbaar maakte
        # (LAT-2865): losse Romaanse voorzetsels in eigennamen.
        raw = page(body="<p>We poured Vin de Constance, Lopez de Heredia and a "
                        "Blanc de Blancs from Voor-Paardeberg.</p>")
        _, flagged = gate.scan(raw, 3)
        self.assertEqual(flagged, [], "eigennamen mogen niet als NL tellen")

    def test_markers_do_not_merge_across_block_elements(self):
        # Drie losse blokjes met elk één marker vormen samen geen "zin".
        raw = page(body="<li>het</li><li>een</li><li>dat</li>")
        _, flagged = gate.scan(raw, 3)
        self.assertEqual(flagged, [])


class TestTechnical(unittest.TestCase):
    def test_clean_page_passes(self):
        p = "/en/streken/"
        self.assertEqual(gate.check_technical(page(alts(p)), BASE + p, 200, BASE), [])

    def test_non_200_fails(self):
        p = "/en/streken/"
        self.assertEqual(gate.check_technical("", BASE + p, 404, BASE), ["HTTP 404"])

    def test_wrong_lang_fails(self):
        p = "/en/streken/"
        raw = page(alts(p)).replace('lang="en"', 'lang="nl"')
        self.assertIn('lang="nl"', gate.check_technical(raw, BASE + p, 200, BASE))

    def test_missing_hreflang_fails(self):
        p = "/en/streken/"
        problems = gate.check_technical(page(), BASE + p, 200, BASE)
        self.assertEqual(len(problems), 3, problems)

    def test_hreflang_pointing_at_wrong_page_fails(self):
        # De fout die "staat er een hreflang?" niet vangt: aanwezig, maar mis
        # gericht -- nl wijst naar een andere pagina dan de EN-tegenhanger.
        p = "/en/streken/"
        raw = page(f'<link rel="alternate" hreflang="en" href="{BASE}{p}">'
                   f'<link rel="alternate" hreflang="nl" href="{BASE}/wijnhuizen/">'
                   f'<link rel="alternate" hreflang="x-default" href="{BASE}/streken/">')
        problems = gate.check_technical(raw, BASE + p, 200, BASE)
        self.assertTrue(any("hreflang=nl" in x for x in problems), problems)

    def test_trailing_slash_is_not_a_difference(self):
        p = "/en/streken/"
        raw = page(f'<link rel="alternate" hreflang="en" href="{BASE}/en/streken">'
                   f'<link rel="alternate" hreflang="nl" href="{BASE}/streken">'
                   f'<link rel="alternate" hreflang="x-default" href="{BASE}/streken">')
        self.assertEqual(gate.check_technical(raw, BASE + p, 200, BASE), [])


class TestInternalNlLinks(unittest.TestCase):
    def test_absolute_nl_link_in_body_is_caught(self):
        # Precies het geval dat een root-relatieve grep mist: de link staat als
        # volledige URL in de body-copy. Gemeten op prod build 914 op
        # /en/artikelen/rioja-wijn-klassiek-versus-modern/.
        raw = page(body=f'<p>More on <a href="{BASE}/landen/spanje/">Spanish '
                        f'wines</a> on VinoMartino.</p>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), ["/landen/spanje/"])

    def test_root_relative_nl_link_is_caught(self):
        raw = page(body='<p>Zie <a href="/landen/spanje/">Spanje</a>.</p>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), ["/landen/spanje/"])

    def test_en_link_is_clean(self):
        raw = page(body='<p><a href="/en/landen/spanje/">Spain</a></p>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), [])

    def test_language_switcher_is_not_a_leak(self):
        # De taalwisselaar draagt hreflang="nl" en wijst met opzet naar NL.
        raw = page(body='<a class="lang-switcher__item" href="/streken/" '
                        'lang="nl" hreflang="nl">NL</a>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), [])

    def test_chrome_outside_main_is_ignored(self):
        # Header/footer staan buiten <main> en wijzen op elke EN-pagina naar NL.
        raw = ('<html lang="en"><body><header><a href="/">Home</a></header>'
               '<main><p>Clean.</p></main>'
               '<footer><a href="/colofon/">Colofon</a></footer></body></html>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), [])

    def test_cdn_cgi_and_assets_are_ignored(self):
        raw = page(body='<a href="/cdn-cgi/l/email-protection#abc">mail</a>'
                        '<a href="/favicon.svg">icon</a>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), [])

    def test_nl_only_family_is_ignored(self):
        raw = page(body='<a href="/reizen-nareizen/langhe-piemonte/">pakket</a>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), [])

    def test_external_links_are_ignored(self):
        raw = page(body='<a href="https://www.instagram.com/x/">ig</a>'
                        '<a href="//cdn.example.com/a/">proto-rel</a>')
        self.assertEqual(gate.internal_nl_links(raw, BASE, NL_ONLY), [])


class TestLiterals(unittest.TestCase):
    def test_each_literal_pattern_matches_its_own_sample(self):
        samples = {
            "affiliate-disclosure":
                "Affiliate-link &middot; als je hier boekt, kunnen wij een commissie ontvangen",
            "affiliate-kort": "Affiliate-links · geen extra kosten",
            "cta-bekijk-boek": '<span class="cta">Bekijk &amp; boek</span>',
            "kbd-navigeren": "<kbd>&uarr;</kbd><kbd>&darr;</kbd> navigeren</span>",
            "atlas-bijschrift": "<p>Elke streek in échte geografie. Beweeg over een gebied.</p>",
            "cluster-40min": "Allemaal binnen ~40 min rijden van elkaar",
            "lege-staat-artikelen": "<h3>Geen artikelen voor deze filters</h3>",
        }
        self.assertEqual(set(samples), set(gate.NL_LITERALS),
                         "elke NL_LITERAL hoort een sample te hebben")
        for key, raw in samples.items():
            self.assertIn(key, gate.find_literals(raw), f"{key} sloeg niet aan")

    def test_clean_english_page_has_no_literals(self):
        raw = page(body="<p>Affiliate links &middot; no extra cost</p>"
                        "<kbd>&uarr;</kbd> navigate</span>"
                        "<h3>No articles for these filters</h3>")
        self.assertEqual(gate.find_literals(raw), {})

    def test_navigeren_in_prose_does_not_count_as_the_kbd_label(self):
        # `kbd-navigeren` ankert op tag-grenzen: het woord midden in een zin is
        # dimensie 1 (nl-sentences), niet een literal-lek.
        raw = page(body="<p>Je kunt hiermee navigeren door de kaart.</p>")
        self.assertNotIn("kbd-navigeren", gate.find_literals(raw))


class TestCoverage(unittest.TestCase):
    def test_full_coverage_has_no_gap(self):
        paths = ["/streken/", "/en/streken/", "/wijnhuizen/", "/en/wijnhuizen/"]
        _, counted, missing, nl_only, orphan = gate.coverage_gaps(paths, NL_ONLY)
        self.assertEqual((missing, orphan), ([], []))
        self.assertEqual(len(counted), 2)

    def test_missing_en_counterpart_is_reported(self):
        paths = ["/streken/", "/en/streken/", "/wijnhuizen/"]
        _, _, missing, _, _ = gate.coverage_gaps(paths, NL_ONLY)
        self.assertEqual(missing, ["/wijnhuizen/"])

    def test_nl_only_family_leaves_the_denominator(self):
        paths = ["/streken/", "/en/streken/", "/reizen-nareizen/langhe/"]
        _, counted, missing, nl_only, _ = gate.coverage_gaps(paths, NL_ONLY)
        self.assertEqual(missing, [])
        self.assertEqual(nl_only, ["/reizen-nareizen/langhe/"])
        self.assertNotIn("/reizen-nareizen/langhe/", counted)

    def test_nl_only_page_counts_again_once_en_exists(self):
        # EN_PRESENT_EXACT_PATHS-gedrag: zodra de EN-versie er is, hoort de
        # pagina weer gewoon mee te tellen i.p.v. permanent vrijgesteld te zijn.
        paths = ["/reizen-nareizen/", "/en/reizen-nareizen/"]
        _, counted, missing, nl_only, _ = gate.coverage_gaps(paths, NL_ONLY)
        self.assertEqual(nl_only, [])
        self.assertEqual(counted, ["/reizen-nareizen/"])
        self.assertEqual(missing, [])

    def test_equal_counts_can_still_be_a_mismatch(self):
        # 2 EN vs 2 NL, maar het zijn niet dezelfde pagina's. Een telling-op-
        # aantal zou dit groen noemen; de paar-vergelijking niet.
        paths = ["/streken/", "/wijnhuizen/", "/en/streken/", "/en/artikelen/"]
        _, _, missing, _, orphan = gate.coverage_gaps(paths, NL_ONLY)
        self.assertEqual(missing, ["/wijnhuizen/"])
        self.assertEqual(orphan, ["/artikelen/"])


class TestPrefixLoading(unittest.TestCase):
    def test_prefixes_come_from_i18n_ts(self):
        # Drift tussen de gate en src/lib/i18n.ts is stil en gevaarlijk: hij
        # verandert de dekkings-noemer zonder dat iemand het merkt.
        repo = os.path.dirname(_HERE)
        prefixes, src = gate.load_nl_only_prefixes(repo)
        self.assertIn("i18n.ts", src)
        self.assertIn("/reizen-nareizen/", prefixes)

    def test_fallback_when_file_missing(self):
        prefixes, src = gate.load_nl_only_prefixes("/nonexistent")
        self.assertIn("fallback", src)
        self.assertEqual(prefixes, gate.NL_ONLY_PREFIXES_FALLBACK)


if __name__ == "__main__":
    unittest.main(verbosity=2)
