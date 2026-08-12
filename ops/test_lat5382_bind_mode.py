#!/usr/bin/env python3
"""LAT-5382 regression test for scoped_broker's bind-mode enforcement.

Falsifiability is the point of this file. It does NOT just assert that the
new blob denies `/:/host:rw` -- a test that only ever runs green against the
fixed code proves nothing about whether it would have caught the bug. Run it
against a blob and it prints a verdict per case; run it against BOTH blobs
(the default when two paths are given) and it additionally asserts that the
cases marked `regression` flipped: they must be ACCEPTED on the old blob and
DENIED on the new one. If a case does not flip, the test fails -- either the
fix is a no-op or the case never exercised the bug.

Every case goes through the real HTTP handler (do_POST/do_DELETE), not
through _binds_ok() directly, so route matching, body framing and the
allow/deny plumbing are all in the path. A stub upstream stands in for
paperclip-devops-proxy-full-1 so nothing touches a real docker socket.

  python3 test_lat5382_bind_mode.py <new_blob> [old_blob]
"""
import http.client
import importlib.machinery
import importlib.util
import json
import socketserver
import sys
import threading
from http.server import BaseHTTPRequestHandler

FAKE_ID = "a" * 64


class StubUpstream(BaseHTTPRequestHandler):
    """Stands in for the unrestricted docker proxy: accepts everything."""

    protocol_version = "HTTP/1.1"

    def _respond(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _drain(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            self.rfile.read(length)

    def do_POST(self):
        self._drain()
        self._respond(201, {"Id": FAKE_ID, "Warnings": []})

    def do_DELETE(self):
        self._drain()
        self._respond(204, {})

    def log_message(self, *a):
        pass


class Threaded(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def load_blob(path, name):
    # Explicit loader: the blobs under test are named .live/.new/.proposed,
    # and spec_from_file_location cannot infer a loader from those suffixes.
    loader = importlib.machinery.SourceFileLoader(name, path)
    spec = importlib.util.spec_from_file_location(name, path, loader=loader)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def serve(handler_cls):
    srv = Threaded(("127.0.0.1", 0), handler_cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def request(port, method, path, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        payload = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"} if payload else {}
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        return resp.status, data
    finally:
        conn.close()


def create(port, host_config):
    return request(port, "POST", "/v1.51/containers/create",
                   {"Image": "alpine", "HostConfig": host_config})[0]


# ---------------------------------------------------------------- cases
# expect: 201 = must be accepted, 403 = must be denied (on the NEW blob).
# regression=True additionally requires the OLD blob to accept it -- that is
# the red counter-proof.
RO = "/opt/paperclip/infra/devops-workspace"
RW_DST = "/write/infra-devops-workspace"

CASES = [
    # --- the bug itself, both spellings ---------------------------------
    dict(name="binds  /:/host:rw", expect=403, regression=True,
         hc={"Binds": ["/:/host:rw"]}),
    dict(name="binds  /:/host (no mode = rw)", expect=403, regression=True,
         hc={"Binds": ["/:/host"]}),
    dict(name="binds  /:/host:rw,rslave", expect=403, regression=True,
         hc={"Binds": ["/:/host:rw,rslave"]}),
    dict(name="mounts /->/host ReadOnly absent", expect=403, regression=True,
         hc={"Mounts": [{"Type": "bind", "Source": "/", "Target": "/host"}]}),
    dict(name="mounts /->/host ReadOnly=False", expect=403, regression=True,
         hc={"Mounts": [{"Type": "bind", "Source": "/", "Target": "/host",
                         "ReadOnly": False}]}),
    dict(name="binds  /:/host:ro:extra (over-split)", expect=403, regression=True,
         hc={"Binds": ["/:/host:ro:rw"]}),
    dict(name="binds  /:/host:ro,rw (rw smuggled in opts)", expect=403, regression=True,
         hc={"Binds": ["/:/host:ro,rw"]}),

    # --- what the approval actually described must still work -----------
    dict(name="binds  /:/host:ro", expect=201, regression=False,
         hc={"Binds": ["/:/host:ro"]}),
    dict(name="binds  /:/host:ro,rslave", expect=201, regression=False,
         hc={"Binds": ["/:/host:ro,rslave"]}),
    dict(name="mounts /->/host ReadOnly=True", expect=201, regression=False,
         hc={"Mounts": [{"Type": "bind", "Source": "/", "Target": "/host",
                         "ReadOnly": True}]}),

    # --- unrelated allowlist entries keep their existing behaviour ------
    dict(name="binds  LAT-3054 write pair :rw", expect=201, regression=False,
         hc={"Binds": ["%s:%s:rw" % (RO, RW_DST)]}),
    dict(name="binds  LAT-3054 write pair, no mode", expect=201, regression=False,
         hc={"Binds": ["%s:%s" % (RO, RW_DST)]}),
    dict(name="binds  named volume", expect=201, regression=False,
         hc={"Binds": ["myvol:/data:rw"]}),
    dict(name="no HostConfig at all", expect=201, regression=False, hc=None),

    # --- pre-existing deny cases must not regress -----------------------
    dict(name="binds  /etc:/etc:ro (not allowlisted)", expect=403, regression=False,
         hc={"Binds": ["/etc:/etc:ro"]}),
    dict(name="binds  /:/host2:ro (wrong dst)", expect=403, regression=False,
         hc={"Binds": ["/:/host2:ro"]}),
    dict(name="binds  /opt:/host:ro (wrong src)", expect=403, regression=False,
         hc={"Binds": ["/opt:/host:ro"]}),
    dict(name="binds  docker.sock", expect=403, regression=False,
         hc={"Binds": ["/var/run/docker.sock:/var/run/docker.sock:ro"]}),
    dict(name="mounts docker.sock", expect=403, regression=False,
         hc={"Mounts": [{"Type": "bind", "Source": "/var/run/docker.sock",
                         "Target": "/var/run/docker.sock", "ReadOnly": True}]}),
    dict(name="binds  /:/host:ro + /etc:/etc:rw (mixed)", expect=403, regression=False,
         hc={"Binds": ["/:/host:ro", "/etc:/etc:rw"]}),
]


def run_case_suite(port):
    return [(c["name"], create(port, c["hc"])) for c in CASES]


def run_audit_probe(mod):
    """Does a /:/host:ro create produce an audit line? (issue point 3)"""
    hc = {"Binds": ["/:/host:ro"]}
    if hasattr(mod, "_audit_binds"):
        return bool(mod._audit_binds(hc))
    return bool(mod._matched_audited_binds(hc))


def run_delete_probe(port, created_id):
    """DELETE of a broker-created id, and of one it never created."""
    mine = request(port, "DELETE", "/v1.51/containers/%s" % created_id)[0]
    theirs = request(port, "DELETE", "/v1.51/containers/paperclip-cos-bridge-1")[0]
    replay = request(port, "DELETE", "/v1.51/containers/%s" % created_id)[0]
    return mine, theirs, replay


def boot(path, name, upstream_port):
    mod = load_blob(path, name)
    mod.UPSTREAM_HOST = "127.0.0.1"
    mod.UPSTREAM_PORT = upstream_port
    srv, port = serve(mod.Handler)
    return mod, srv, port


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    new_path = sys.argv[1]
    old_path = sys.argv[2] if len(sys.argv) > 2 else None

    _, upstream_port = serve(StubUpstream)

    new_mod, _, new_port = boot(new_path, "broker_new", upstream_port)
    new_results = dict(run_case_suite(new_port))

    old_results = None
    if old_path:
        _, _, old_port = boot(old_path, "broker_old", upstream_port)
        old_results = dict(run_case_suite(old_port))

    failures = []
    print("%-42s %-9s %-9s %s" % ("case", "old", "new", "verdict"))
    print("-" * 78)
    for c in CASES:
        name = c["name"]
        got = new_results[name]
        old = old_results[name] if old_results else None
        ok = got == c["expect"]
        verdict = "ok" if ok else "FAIL (want %d)" % c["expect"]
        if not ok:
            failures.append("%s: new blob returned %d, want %d" % (name, got, c["expect"]))
        if c["regression"] and old_results is not None:
            if old != 201:
                verdict += "  [NO-FLIP: old blob already denied it -> case proves nothing]"
                failures.append("%s: old blob returned %d, expected 201 (red case did not "
                                "reproduce the bug)" % (name, old))
            elif ok:
                verdict += "  [flipped 201->403]"
        print("%-42s %-9s %-9s %s" % (name, old if old is not None else "-", got, verdict))

    print()
    print("--- audit coverage of ('/','/host') (issue point 3) ---")
    new_audit = run_audit_probe(new_mod)
    print("new blob logs an AUDIT line for /:/host:ro : %s" % new_audit)
    if old_path:
        old_mod = sys.modules["broker_old"]
        old_audit = run_audit_probe(old_mod)
        print("old blob logs an AUDIT line for /:/host:ro : %s" % old_audit)
        if old_audit:
            failures.append("audit: old blob already logged /:/host -- point 3 not reproduced")
    if not new_audit:
        failures.append("audit: new blob still does not log ('/','/host')")

    print()
    print("--- DELETE self-cleanup (LAT-5360) ---")
    if create(new_port, {"Binds": ["/:/host:ro"]}) != 201:
        failures.append("delete: setup create failed")
    mine, theirs, replay = run_delete_probe(new_port, FAKE_ID)
    print("new: DELETE own created id        = %d (want 204)" % mine)
    print("new: DELETE paperclip-cos-bridge-1= %d (want 403)" % theirs)
    print("new: DELETE same id again (replay)= %d (want 403)" % replay)
    if mine != 204:
        failures.append("delete: own container returned %d, want 204" % mine)
    if theirs != 403:
        failures.append("delete: foreign container returned %d, want 403" % theirs)
    if replay != 403:
        failures.append("delete: replay returned %d, want 403 (must be one-shot)" % replay)
    if old_path:
        old_port_mod = sys.modules["broker_old"]
        _, _, old_port2 = boot(old_path, "broker_old_del", upstream_port)
        create(old_port2, {"Binds": ["/:/host:ro"]})
        old_mine = request(old_port2, "DELETE", "/v1.51/containers/%s" % FAKE_ID)[0]
        print("old: DELETE own created id        = %d (the leak this fixes)" % old_mine)
        assert old_port_mod is not None
        if old_mine != 403:
            failures.append("delete: old blob returned %d, expected 403 (leak not reproduced)"
                            % old_mine)

    print()
    if failures:
        print("FAILED (%d)" % len(failures))
        for f in failures:
            print("  - %s" % f)
        return 1
    print("PASSED: %d ACL cases, audit widening, and DELETE self-cleanup." % len(CASES))
    if old_path:
        n = sum(1 for c in CASES if c["regression"])
        print("        %d red cases confirmed 201 on the live blob and 403 on the new one." % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
