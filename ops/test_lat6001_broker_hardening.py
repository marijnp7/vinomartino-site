#!/usr/bin/env python3
"""LAT-6001 -- regressietest voor de scoped broker: create/start-race,
DELETE-op-naam, en het image-opruimpad.

Draait de kandidaat-broker tegen een NEP-upstream op scratch-loopbackpoorten.
De live broker en de echte docker-daemon worden nooit aangeraakt.

    test_lat6001_broker_hardening.py <nieuwe-blob.py> <live-blob.py>

Deze gate vervangt test_lat4772_name_start.py en draagt al zijn checks mee: die
gate had de live blob als rode basislijn met FLIP_CHECK "start OP NAAM", maar de
LAT-4772-deploy heeft precies die bug live gerepareerd, dus dat contract kan
daar per definitie niet meer rood staan.

FALSIFIEERBAARHEID -- waarom de widen-injectie geen zelf-match is
----------------------------------------------------------------
De race in gat 1 is een venster van microseconden: tussen `wfile.write(data)`
en `_startable_ids.add(...)`. Van buitenaf is dat niet betrouwbaar te raken --
live gemeten haalde hij 1 op de 4 runs. Een test die daarop vertrouwt is flakey
in beide richtingen.

Daarom verbreedt deze test het venster, met een injectie die

  * op EEN tekstueel anker zit dat in BEIDE blobs voorkomt
    (`return resp.status, data`, het einde van `_forward_capture`),
  * in beide blobs IDENTIEK wordt toegepast, en
  * hard faalt als het anker in een van beide ontbreekt (geen stille no-op --
    dat is precies hoe een injectietest een zelfvervullende profetie wordt).

Het anker zit na de schrijfactie naar de client. In de LIVE blob staat de
registratie daarna, dus de sleep valt er middenin: start-op-naam wordt
gegarandeerd 403. In de NIEUWE blob is de registratie naar een on_response-hook
vóór de client-write verplaatst, dus dezelfde sleep verandert niets: 204. Zelfde
anker, zelfde vertraging, tegengestelde uitkomst -- dat is een echte flip.

Daarnaast draait een ONGEWIJZIGDE herhalingstest (RACE_REPS x create+start,
zonder enige delay en zonder injectie) die op de nieuwe blob nul onterechte
403's moet opleveren. De settle-delay van 0,25 s uit de oude gate is weg.
"""
import ast
import http.client
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Het anker waar de widen-injectie op zit. Staat aan het EINDE van
# _forward_capture, dus na de schrijfactie naar de client.
WIDEN_ANCHOR = "            return resp.status, data"
WIDEN_SECONDS = 0.4

# Herhalingen voor de ongewijzigde (niet-verbrede) race-check.
RACE_REPS = 30

# Images die de nep-upstream als "bestaat al" rapporteert. node:24 staat voor
# een echt infra-image; reeds-aanwezig:tmp is de tegenproef op
# clobber-then-delete (bouwen op een BESTAANDE tag mag geen delete-recht geven).
UPSTREAM_EXISTING_IMAGES = {"node:24", "reeds-aanwezig:tmp"}

# ACL-constanten die deze wijziging niet mag aanraken. Wordt per AST vergeleken
# tussen beide blobs: dit is het mechanische bewijs bij de claim "geen nieuw
# host-pad, geen nieuwe container, geen nieuw image bereikbaar".
FROZEN_CONSTANTS = [
    "HOST_BIND_ALLOWLIST",
    "RO_ONLY_BINDS",
    "RO_SAFE_BIND_OPTS",
    "AUDITED_BINDS",
    "RESTART_ALLOWLIST",
    "VINO_BUILD_IMAGE",
    "VINO_BUILD_BIND_PREFIX",
]


def start_upstream(port):
    counter = {"n": 0}

    class Upstream(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _drain(self):
            te = self.headers.get("Transfer-Encoding", "")
            if te and "chunked" in te.lower():
                while True:
                    size_line = self.rfile.readline(65538)
                    if not size_line:
                        return b""
                    size = int(size_line.split(b";", 1)[0].strip() or b"0", 16)
                    if size == 0:
                        while True:
                            t = self.rfile.readline(65538)
                            if t in (b"\r\n", b"\n", b""):
                                break
                        return b""
                    self.rfile.read(size)
                    self.rfile.read(2)
            n = int(self.headers.get("Content-Length", 0) or 0)
            return self.rfile.read(n) if n else b""

        def _send(self, code, obj=None):
            data = json.dumps(obj).encode() if obj is not None else b""
            self.send_response(code)
            if obj is not None:
                self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if data:
                self.wfile.write(data)

        def do_POST(self):
            self._drain()
            path = self.path.split("?")[0]
            if path.endswith("/containers/create"):
                counter["n"] += 1
                self._send(201, {"Id": "feed%012d" % counter["n"], "Warnings": []})
                return
            if path.endswith("/build"):
                self._send(200, {"stream": "Successfully built"})
                return
            self._send(204)

        def do_DELETE(self):
            self._drain()
            # De echte docker-engine antwoordt hier NIET uniform: een container
            # geeft 204 No Content, een image geeft 200 met een JSON-lijst van
            # {Untagged,Deleted}. Deze nepupstream gaf eerst overal 204, en dat
            # verschil kwam pas op de echte broker aan het licht -- de
            # deploy-gate eiste 204 en rolde een geslaagde image-delete terug
            # (run 31817228920). Een fixture die niet doet wat het echte systeem
            # doet, verbergt precies dit soort mismatch.
            # Let op: de broker forwardt MET het /v1.51-versievoorvoegsel, dus
            # dit moet een substring-check zijn, geen startswith.
            if "/images/" in self.path.split("?")[0]:
                self._send(200, [{"Untagged": "lat6001:tmp"},
                                 {"Deleted": "sha256:deadbeef"}])
                return
            self._send(204)

        def do_GET(self):
            path = self.path.split("?")[0]
            # /images/<urlencoded ref>/json -- het bestaans-probe-pad.
            if path.startswith("/images/") and path.endswith("/json"):
                import urllib.parse as _u
                ref = _u.unquote(path[len("/images/"):-len("/json")])
                if ref in UPSTREAM_EXISTING_IMAGES:
                    self._send(200, {"Id": "sha256:deadbeef"})
                else:
                    self._send(404, {"message": "no such image"})
                return
            self._send(200, {"ApiVersion": "1.51"})

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port), Upstream)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def _prepare_blob(blob_path, up_port, br_port, widen):
    """Herschrijf de upstream-constanten en (optioneel) injecteer de
    venster-verbreding. Faalt hard als een van de ankers ontbreekt."""
    src = open(blob_path).read()
    src = src.replace('UPSTREAM_HOST = "paperclip-devops-proxy-full-1"',
                      'UPSTREAM_HOST = "127.0.0.1"')
    src = src.replace("UPSTREAM_PORT = 2375", "UPSTREAM_PORT = %d" % up_port)
    src = src.replace("LISTEN_PORT = 2375", "LISTEN_PORT = %d" % br_port)
    if '"127.0.0.1"' not in src or ("UPSTREAM_PORT = %d" % up_port) not in src:
        raise SystemExit("kon de upstream-constanten niet herschrijven in %s" % blob_path)

    if widen:
        n = src.count(WIDEN_ANCHOR + "\n")
        if n != 1:
            # Stil overslaan zou deze test waardeloos maken: de nieuwe blob zou
            # dan "groen" zijn omdat er niets is geinjecteerd.
            raise SystemExit(
                "widen-anker %r komt %d keer voor in %s (verwacht precies 1); "
                "de injectie is niet toegepast en de test bewijst dus niets"
                % (WIDEN_ANCHOR, n, blob_path))
        src = src.replace(
            WIDEN_ANCHOR + "\n",
            '            __import__("time").sleep(%r)\n' % WIDEN_SECONDS
            + WIDEN_ANCHOR + "\n", 1)
    return src


def _spawn(src, br_port):
    tmpdir = tempfile.mkdtemp(prefix="lat6001-gate-")
    cand = os.path.join(tmpdir, "broker_under_test.py")
    with open(cand, "w") as fh:
        fh.write(src)
    proc = subprocess.Popen([sys.executable, cand],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Wacht tot hij luistert in plaats van blind te slapen.
    for _ in range(60):
        time.sleep(0.1)
        try:
            c = http.client.HTTPConnection("127.0.0.1", br_port, timeout=2)
            c.request("GET", "/_ping")
            c.getresponse().read()
            c.close()
            break
        except OSError:
            continue
    return proc, tmpdir


def _client(br_port):
    def call(method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", br_port, timeout=15)
        try:
            conn.request(method, path, body=body,
                         headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()
    return call


def run_race_only(blob_path, up_port, br_port):
    """Alleen de verbrede race-check. Zie de module-docstring."""
    srv = start_upstream(up_port)
    proc, tmpdir = _spawn(_prepare_blob(blob_path, up_port, br_port, WIDEN_SECONDS), br_port)
    call = _client(br_port)
    try:
        name = "lat6001-race-widened"
        status, _ = call("POST", "/v1.51/containers/create?name=" + name, b"{}")
        if status != 201:
            return {"RACE (verbreed): create slaagde": (status, 201)}
        # GEEN delay: precies wat `docker create X && docker start X` doet.
        start = call("POST", "/v1.51/containers/%s/start" % name)[0]
        return {"RACE (verbreed): start op naam direct na create": (start, 204)}
    finally:
        _teardown(proc, tmpdir, srv)


def _teardown(proc, tmpdir, srv):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    srv.shutdown()
    subprocess.run(["rm", "-rf", tmpdir])


def run_suite(blob_path, up_port, br_port):
    """Volledige suite, ZONDER injectie en ZONDER settle-delay."""
    srv = start_upstream(up_port)
    proc, tmpdir = _spawn(_prepare_blob(blob_path, up_port, br_port, 0), br_port)
    call = _client(br_port)
    out = {}

    def create(name=None, body=b"{}"):
        path = "/v1.51/containers/create"
        if name:
            path += "?name=" + name
        status, data = call("POST", path, body)
        cid = None
        if status == 201:
            try:
                cid = json.loads(data).get("Id")
            except (json.JSONDecodeError, AttributeError):
                cid = None
        return status, cid

    def build(tag):
        return call("POST", "/v1.24/build?t=" + tag, b"tarball")[0]

    try:
        # === LAT-5348 / LAT-4772: start op naam (moet blijven werken) ======
        status, _ = create("lat6001-gate-a")
        out["create met ?name="] = (status, 201)
        out["start OP NAAM na create"] = (
            call("POST", "/v1.51/containers/lat6001-gate-a/start")[0], 204)
        out["one-shot: 2e start op dezelfde naam geweigerd"] = (
            call("POST", "/v1.51/containers/lat6001-gate-a/start")[0], 403)

        _, cid_b = create("lat6001-gate-b")
        out["start op ID werkt nog"] = (
            call("POST", "/v1.51/containers/%s/start" % cid_b)[0], 204)
        out["one-shot: 2e start op hetzelfde id geweigerd"] = (
            call("POST", "/v1.51/containers/%s/start" % cid_b)[0], 403)

        out["ROOD: start bestaande paperclip-db-1 geweigerd"] = (
            call("POST", "/v1.51/containers/paperclip-db-1/start")[0], 403)
        out["ROOD: start onbekende naam geweigerd"] = (
            call("POST", "/v1.51/containers/lat6001-nooit-gemaakt/start")[0], 403)
        create()
        out["ROOD: kale create geeft geen naam vrij"] = (
            call("POST", "/v1.51/containers/een-andere-naam/start")[0], 403)

        # === LAT-6001 gat 1: race, ongewijzigd en herhaald ==================
        # Geen injectie, geen delay -- de realistische meting. Op de nieuwe blob
        # moet dit exact 0 zijn; een enkele 403 hier is de bug.
        spurious = 0
        for i in range(RACE_REPS):
            nm = "lat6001-race-%d" % i
            st, _ = create(nm)
            if st != 201:
                spurious += 1
                continue
            if call("POST", "/v1.51/containers/%s/start" % nm)[0] != 204:
                spurious += 1
        out["RACE (%d reps, geen delay): onterechte 403's" % RACE_REPS] = (spurious, 0)

        # === LAT-6001 gat 2: DELETE op naam ================================
        _, cid_d = create("lat6001-gate-delnaam")
        out["FIX: DELETE op NAAM van eigen container"] = (
            call("DELETE", "/v1.51/containers/lat6001-gate-delnaam")[0], 204)
        out["one-shot: 2e DELETE op dezelfde naam geweigerd"] = (
            call("DELETE", "/v1.51/containers/lat6001-gate-delnaam")[0], 403)
        # De id-route moet blijven werken (LAT-5360/5382 niet geregresseerd).
        _, cid_e = create("lat6001-gate-delid")
        out["LAT-5382: DELETE eigen container op ID toegestaan"] = (
            call("DELETE", "/v1.51/containers/%s" % cid_e)[0], 204)
        # ...en het poppen moet BEIDE spellingen meenemen.
        out["one-shot: naam weg nadat het ID is verbruikt"] = (
            call("DELETE", "/v1.51/containers/lat6001-gate-delid")[0], 403)
        out["ROOD: DELETE bestaande container op naam geweigerd"] = (
            call("DELETE", "/v1.51/containers/paperclip-db-1")[0], 403)
        out["ROOD: DELETE willekeurig ID geweigerd"] = (
            call("DELETE", "/v1.51/containers/feed999999999999")[0], 403)

        # === LAT-6001 gat 3: image-opruimpad ===============================
        out["build met ?t= gaat door"] = (build("lat6001-gate:tmp"), 200)
        out["FIX: DELETE van zelfgebouwd image"] = (
            call("DELETE", "/v1.51/images/lat6001-gate:tmp")[0], 200)
        out["one-shot: 2e DELETE van dat image geweigerd"] = (
            call("DELETE", "/v1.51/images/lat6001-gate:tmp")[0], 403)
        # `-t foo` == `foo:latest`; beide spellingen moeten dezelfde tag zijn.
        build("lat6001-notag")
        out["impliciete :latest wordt genormaliseerd"] = (
            call("DELETE", "/v1.51/images/lat6001-notag:latest")[0], 200)
        # RODE TEGENPROEVEN -- dit is waar het image-pad smal blijft.
        out["ROOD: DELETE nooit-gebouwd image geweigerd"] = (
            call("DELETE", "/v1.51/images/node:24")[0], 403)
        # Clobber-then-delete: bouwen OP een bestaande tag geeft geen recht om
        # die tag te verwijderen. Zonder deze regel zou /build (dat al vrij is)
        # een route naar elk infra-image openen.
        out["build op een BESTAANDE tag gaat door"] = (build("reeds-aanwezig:tmp"), 200)
        out["ROOD: clobber-then-delete geweigerd"] = (
            call("DELETE", "/v1.51/images/reeds-aanwezig:tmp")[0], 403)
        out["ROOD: DELETE volume geweigerd"] = (
            call("DELETE", "/v1.51/volumes/lat6001-vol")[0], 403)

        # === restart-ACL ongemoeid =========================================
        out["restart allowlisted naam gaat door"] = (
            call("POST", "/v1.51/containers/paperclip-cos-1/restart")[0], 204)
        out["ROOD: restart niet-allowlisted geweigerd"] = (
            call("POST", "/v1.51/containers/paperclip-db-1/restart")[0], 403)

        # === LAT-5382 bind-mode mag niet geregresseerd zijn ==================
        ro = json.dumps({"HostConfig": {"Binds": ["/:/host:ro"]}}).encode()
        rw = json.dumps({"HostConfig": {"Binds": ["/:/host:rw"]}}).encode()
        sock = json.dumps(
            {"HostConfig": {"Binds": ["/var/run/docker.sock:/var/run/docker.sock"]}}).encode()
        out["LAT-5382: read-only bind toegestaan"] = (
            call("POST", "/v1.51/containers/create", ro)[0], 201)
        out["LAT-5382 ROOD: zelfde paar read-WRITE geweigerd"] = (
            call("POST", "/v1.51/containers/create", rw)[0], 403)
        out["ROOD: docker.sock-bind geweigerd"] = (
            call("POST", "/v1.51/containers/create", sock)[0], 403)

        # === LAT-4772 defect 1: chunked body mag niet desyncen ==============
        conn = http.client.HTTPConnection("127.0.0.1", br_port, timeout=15)
        try:
            conn.putrequest("POST", "/v1.24/build?t=lat6001-chunked:tmp")
            conn.putheader("Transfer-Encoding", "chunked")
            conn.putheader("Content-Type", "application/x-tar")
            conn.endheaders()
            for blob in (b"A" * 2048, b"B" * 512):
                conn.send(b"%x\r\n" % len(blob) + blob + b"\r\n")
            conn.send(b"0\r\n\r\n")
            resp = conn.getresponse()
            resp.read()
            out["defect1: chunked /build gaat door (geen 403)"] = (resp.status, 200)
            conn.request("GET", "/v1.51/version")
            resp2 = conn.getresponse()
            resp2.read()
            out["defect1: keep-alive nog intact na chunked"] = (resp2.status, 200)
        finally:
            conn.close()

        # === smuggling-guard ================================================
        conn = http.client.HTTPConnection("127.0.0.1", br_port, timeout=15)
        try:
            conn.putrequest("POST", "/v1.51/containers/create", skip_accept_encoding=True)
            conn.putheader("Transfer-Encoding", "chunked")
            conn.putheader("Content-Length", "2")
            conn.endheaders()
            conn.send(b"0\r\n\r\n")
            resp = conn.getresponse()
            resp.read()
            out["smuggling: CL+TE geweigerd met 400"] = (resp.status, 400)
        finally:
            conn.close()
    finally:
        _teardown(proc, tmpdir, srv)

    return out


def frozen_constants_diff(new_blob, live_blob):
    """Vergelijk de ACL-constanten per AST. Dit is het mechanische bewijs bij
    'geen nieuw host-pad bereikbaar' -- sterker dan een regeltelling op de
    diff, want het kijkt naar de waarden zelf."""
    def consts(path):
        tree = ast.parse(open(path).read())
        found = {}
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id in FROZEN_CONSTANTS:
                    found[tgt.id] = ast.literal_eval(node.value)
        return found

    a, b = consts(new_blob), consts(live_blob)
    problems = []
    for name in FROZEN_CONSTANTS:
        if name not in a or name not in b:
            problems.append("%s ontbreekt (nieuw=%s live=%s)"
                            % (name, name in a, name in b))
        elif a[name] != b[name]:
            problems.append("%s is GEWIJZIGD: live=%r nieuw=%r" % (name, b[name], a[name]))
    return problems


def report(label, results):
    print("=== %s ===" % label)
    failed = []
    for name, (got, want) in results.items():
        ok = got == want
        if not ok:
            failed.append(name)
        print("  %-4s %-56s got=%s want=%s" % ("PASS" if ok else "FAIL", name, got, want))
    print("  %d/%d checks geslaagd" % (len(results) - len(failed), len(results)))
    return failed


# De checks die de drie gaten van LAT-6001 aantonen. Elk hiervan MOET rood zijn
# op de live blob -- anders test deze gate niets.
FLIP_CHECKS = {
    "FIX: DELETE op NAAM van eigen container": 403,
    "FIX: DELETE van zelfgebouwd image": 403,
}
RACE_FLIP_CHECK = "RACE (verbreed): start op naam direct na create"

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    new_blob, live_blob = sys.argv[1], sys.argv[2]

    problems = []

    frozen = frozen_constants_diff(new_blob, live_blob)
    print("=== ACL-constanten ongewijzigd t.o.v. de live blob ===")
    if frozen:
        for p in frozen:
            print("  FAIL %s" % p)
        problems.append("ACL-constanten gewijzigd: %s" % "; ".join(frozen))
    else:
        print("  PASS alle %d constanten identiek: %s"
              % (len(FROZEN_CONSTANTS), ", ".join(FROZEN_CONSTANTS)))
    print()

    new_results = run_suite(new_blob, 18401, 18402)
    new_failed = report("NIEUWE blob: %s" % new_blob, new_results)
    print()

    live_results = run_suite(live_blob, 18403, 18404)
    report("LIVE blob (basislijn): %s" % live_blob, live_results)
    print()

    # Verbrede race-check: identieke injectie op beide blobs.
    new_race = run_race_only(new_blob, 18405, 18406)
    report("NIEUWE blob, venster verbreed met %ss" % WIDEN_SECONDS, new_race)
    live_race = run_race_only(live_blob, 18407, 18408)
    report("LIVE blob, venster verbreed met %ss (moet ROOD)" % WIDEN_SECONDS, live_race)
    print()

    if new_failed:
        problems.append("nieuwe blob faalt op: %s" % ", ".join(new_failed))
    if new_race.get(RACE_FLIP_CHECK, (None,))[0] != 204:
        problems.append("nieuwe blob verliest de verbrede race: %s=%s"
                        % (RACE_FLIP_CHECK, new_race.get(RACE_FLIP_CHECK)))

    # NO-FLIP: elke gerepareerde bug moet op de live blob aantoonbaar aanwezig
    # zijn. Groen op alleen de nieuwe blob bewijst niet dat deze test de bug
    # ooit gezien zou hebben.
    for check, want_live in FLIP_CHECKS.items():
        got_live = live_results.get(check, (None, None))[0]
        if got_live != want_live:
            problems.append(
                "NO-FLIP: %r gaf %s op de live blob, verwacht %s (de bug moet "
                "daar aanwezig zijn)" % (check, got_live, want_live))
    live_race_got = live_race.get(RACE_FLIP_CHECK, (None, None))[0]
    if live_race_got != 403:
        problems.append(
            "NO-FLIP: %r gaf %s op de verbrede live blob, verwacht 403 (de race "
            "moet daar aantoonbaar zijn)" % (RACE_FLIP_CHECK, live_race_got))

    if problems:
        for p in problems:
            print("::error::%s" % p)
        raise SystemExit(1)
    print("GATE OK: rood op live (race=%s, %s), groen op nieuw (%d/%d + race 204)"
          % (live_race_got,
             ", ".join("%s=%s" % (k, live_results.get(k, ("?",))[0]) for k in FLIP_CHECKS),
             len(new_results), len(new_results)))
