#!/usr/bin/env python3
"""LAT-4772 / LAT-5348 -- regressietest voor start-by-name op de scoped broker.

Draait de kandidaat-broker tegen een NEP-upstream op scratch-loopbackpoorten.
De live broker en de echte docker-daemon worden nooit aangeraakt.

    test_lat4772_name_start.py <nieuwe-blob.py> <live-blob.py>

De test is falsifieerbaar gemaakt met een NO-FLIP-gate: hij moet ROOD zijn op
de live blob en GROEN op de nieuwe. Alleen groen op de nieuwe blob bewijst
niet dat deze test de bug ooit gezien zou hebben.

Waarom de settle-delay na elke create: de broker schrijft het 201-antwoord
naar de client *voordat* hij de id/naam in `_startable_ids` zet
(`_forward_capture(...)` gevolgd door `_startable_ids.add(...)` in do_POST).
Een client die meteen `start` stuurt kan die schrijfactie dus inhalen en een
onterechte 403 krijgen. Dat is een echte race in de draaiende broker -- hij
is gemeten (1 op 4 runs) en apart gerapporteerd op LAT-4772; hij wordt hier
weggedelayd zodat deze gate niet flakey wordt, NIET omdat hij onschuldig is.
"""
import http.client
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SETTLE = 0.25  # zie docstring


def start_upstream(port):
    counter = {"n": 0}

    class Upstream(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _drain(self):
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
            if self.path.split("?")[0].endswith("/containers/create"):
                counter["n"] += 1
                self._send(201, {"Id": "feed%012d" % counter["n"], "Warnings": []})
                return
            self._send(204)

        def do_DELETE(self):
            self._send(204)

        def do_GET(self):
            self._send(200, {"ApiVersion": "1.51"})

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", port), Upstream)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run_suite(blob_path, up_port, br_port):
    """Start blob_path as a broker against a fake upstream; return check->(got, want)."""
    srv = start_upstream(up_port)
    src = open(blob_path).read()
    src = src.replace('UPSTREAM_HOST = "paperclip-devops-proxy-full-1"',
                      'UPSTREAM_HOST = "127.0.0.1"')
    src = src.replace("UPSTREAM_PORT = 2375", "UPSTREAM_PORT = %d" % up_port)
    src = src.replace("LISTEN_PORT = 2375", "LISTEN_PORT = %d" % br_port)
    if '"127.0.0.1"' not in src or ("UPSTREAM_PORT = %d" % up_port) not in src:
        raise SystemExit("kon de upstream-constanten niet herschrijven in %s" % blob_path)

    tmpdir = tempfile.mkdtemp(prefix="lat4772-gate-")
    cand = os.path.join(tmpdir, "broker_under_test.py")
    with open(cand, "w") as fh:
        fh.write(src)
    proc = subprocess.Popen([sys.executable, cand],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)

    out = {}

    def call(method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", br_port, timeout=10)
        try:
            conn.request(method, path, body=body,
                         headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def create(name=None, body=b"{}"):
        path = "/v1.51/containers/create"
        if name:
            path += "?name=" + name
        status, data = call("POST", path, body)
        time.sleep(SETTLE)
        cid = None
        if status == 201:
            try:
                cid = json.loads(data).get("Id")
            except (json.JSONDecodeError, AttributeError):
                cid = None
        return status, cid

    try:
        # --- de fix zelf --------------------------------------------------
        status, cid_a = create("lat4772-gate-a")
        out["create met ?name="] = (status, 201)
        out["FIX: start OP NAAM na create"] = (
            call("POST", "/v1.51/containers/lat4772-gate-a/start")[0], 204)
        out["one-shot: 2e start op dezelfde naam geweigerd"] = (
            call("POST", "/v1.51/containers/lat4772-gate-a/start")[0], 403)

        # --- id-pad ongewijzigd ------------------------------------------
        _, cid_b = create("lat4772-gate-b")
        out["start op ID werkt nog"] = (
            call("POST", "/v1.51/containers/%s/start" % cid_b)[0], 204)
        out["one-shot: 2e start op hetzelfde id geweigerd"] = (
            call("POST", "/v1.51/containers/%s/start" % cid_b)[0], 403)

        # --- rode tegenproeven: de grant blijft smal ----------------------
        out["ROOD: start bestaande paperclip-db-1 geweigerd"] = (
            call("POST", "/v1.51/containers/paperclip-db-1/start")[0], 403)
        out["ROOD: start onbekende naam geweigerd"] = (
            call("POST", "/v1.51/containers/lat4772-nooit-gemaakt/start")[0], 403)
        create()  # create zonder ?name= mag geen enkele naam vrijgeven
        out["ROOD: kale create geeft geen naam vrij"] = (
            call("POST", "/v1.51/containers/een-andere-naam/start")[0], 403)

        # --- restart-ACL ongemoeid ---------------------------------------
        out["restart allowlisted naam gaat door"] = (
            call("POST", "/v1.51/containers/paperclip-cos-1/restart")[0], 204)
        out["ROOD: restart niet-allowlisted geweigerd"] = (
            call("POST", "/v1.51/containers/paperclip-db-1/restart")[0], 403)

        # --- LAT-5382 mag niet geregresseerd zijn -------------------------
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

        # --- LAT-5360/5382 DELETE-pad -------------------------------------
        _, cid_d = create("lat4772-gate-del")
        out["LAT-5382: DELETE eigen container toegestaan"] = (
            call("DELETE", "/v1.51/containers/%s" % cid_d)[0], 204)
        out["LAT-5382 ROOD: DELETE bestaande container geweigerd"] = (
            call("DELETE", "/v1.51/containers/paperclip-db-1")[0], 403)

        # --- LAT-4772 defect 1: chunked body mag niet desyncen ------------
        conn = http.client.HTTPConnection("127.0.0.1", br_port, timeout=10)
        try:
            conn.putrequest("POST", "/v1.24/build?t=lat4772-gate:tmp")
            conn.putheader("Transfer-Encoding", "chunked")
            conn.putheader("Content-Type", "application/x-tar")
            conn.endheaders()
            for blob in (b"A" * 2048, b"B" * 512):
                conn.send(b"%x\r\n" % len(blob) + blob + b"\r\n")
            conn.send(b"0\r\n\r\n")
            resp = conn.getresponse()
            resp.read()
            out["defect1: chunked /build gaat door (geen 403)"] = (resp.status, 204)
            conn.request("GET", "/v1.51/version")
            resp2 = conn.getresponse()
            resp2.read()
            out["defect1: keep-alive nog intact na chunked"] = (resp2.status, 200)
        finally:
            conn.close()

        # --- smuggling-guard ----------------------------------------------
        conn = http.client.HTTPConnection("127.0.0.1", br_port, timeout=10)
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
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        srv.shutdown()
        subprocess.run(["rm", "-rf", tmpdir])

    return out


def report(label, results):
    print("=== %s ===" % label)
    failed = []
    for name, (got, want) in results.items():
        ok = got == want
        if not ok:
            failed.append(name)
        print("  %-4s %-52s got=%s want=%s" % ("PASS" if ok else "FAIL", name, got, want))
    print("  %d/%d checks geslaagd" % (len(results) - len(failed), len(results)))
    return failed


# De check die de bug van LAT-5348 aantoont. Deze moet op de live blob ROOD
# staan, anders test deze gate niets.
FLIP_CHECK = "FIX: start OP NAAM na create"

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    new_blob, live_blob = sys.argv[1], sys.argv[2]

    new_results = run_suite(new_blob, 18301, 18302)
    new_failed = report("NIEUWE blob: %s" % new_blob, new_results)

    live_results = run_suite(live_blob, 18303, 18304)
    live_failed = report("LIVE blob (moet rood zijn op %s): %s" % (FLIP_CHECK, live_blob),
                         live_results)

    problems = []
    if new_failed:
        problems.append("nieuwe blob faalt op: %s" % ", ".join(new_failed))
    live_got = live_results.get(FLIP_CHECK, (None, None))[0]
    if live_got != 403:
        problems.append(
            "NO-FLIP: %r gaf %s op de live blob, verwacht 403 (de bug moet daar "
            "aanwezig zijn, anders bewijst deze test niets)" % (FLIP_CHECK, live_got))

    print()
    if problems:
        for p in problems:
            print("::error::%s" % p)
        raise SystemExit(1)
    print("GATE OK: rood op live (%s=%s), groen op nieuw (%d/%d)"
          % (FLIP_CHECK, live_got, len(new_results), len(new_results)))
