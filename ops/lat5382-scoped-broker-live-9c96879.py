#!/usr/bin/env python3
"""LAT-3001 scoped DOCKER_HOST broker for devops-workspace.

Body-aware sidecar sitting between devops-workspace's own DOCKER_HOST and the
unrestricted paperclip-devops-proxy-full-1. Unlike the path-only haproxy ACL
used for the general exec broker (LAT-2986), POST /containers/create bodies
must be parsed as JSON to validate HostConfig.Binds/Mounts against an explicit
allowlist -- a path-only ACL cannot see into the request body.

Deny-by-default: any route/method not explicitly matched below returns 403.
"""
import datetime
import http.client
import json
import re
import socket
import socketserver
import threading
from http.server import BaseHTTPRequestHandler

UPSTREAM_HOST = "paperclip-devops-proxy-full-1"
UPSTREAM_PORT = 2375
LISTEN_PORT = 2375

# Host-bind pairs (source, dest) inventoried from live compose files under
# /opt/paperclip-cos that devops-workspace's own compose workflows manage.
# Named volumes (source without a leading "/") are not host paths and are
# allowed unconditionally -- see _binds_ok. /var/run/docker.sock is NEVER
# allowlisted here regardless of this list's contents (see _is_docker_sock);
# paperclip-cos-bridge-1 mounts it rw and recreating that container through
# this broker would be the same one-hop host-root pivot the LAT-2986 exec ACL
# already excludes cos-bridge for.
HOST_BIND_ALLOWLIST = {
    ("/root/.agent-secrets-fallback/openrouter-reader.env", "/run/secrets/openrouter-reader.env"),
    ("/opt/paperclip-cos/resourcespace-dam/config.php", "/var/www/html/include/config.php"),
    ("/opt/paperclip-cos/directus-backup/backup.env", "/backup/backup.env"),
    ("/opt/paperclip-cos/directus-backup/backup-age.key", "/backup/backup-age.key"),
    ("/opt/paperclip-cos/directus-backup/scripts", "/backup/scripts"),
    ("/opt/paperclip-cos/backups", "/staging"),
    # LAT-3210: paperclip-monitor-1's existing, already-running bind (since
    # LAT-2793) -- read-only + rslave, no new host access, only needed so a
    # `docker compose up --build` recreate of that one service is possible
    # through this broker. Approved via board approval c1960763 on LAT-3210.
    ("/", "/host"),
    # LAT-3054: narrow write-path for infra/devops-workspace/ only (not all of
    # infra/, not /opt/paperclip in general) -- approved as Option A via
    # LAT-3044 (approval 51ee6965). Every create that uses this pair is
    # audit-logged, see AUDITED_BINDS / _audit_write below.
    ("/opt/paperclip/infra/devops-workspace", "/write/infra-devops-workspace"),
}

# Bind pairs that require a mandatory audit-log entry per write, per the
# LAT-3044-approved condition for the infra/devops-workspace/ path. This is
# deliberately a subset of HOST_BIND_ALLOWLIST, not all of it -- older entries
# were not conditioned on audit logging and this doesn't change their
# behavior.
AUDITED_BINDS = {
    ("/opt/paperclip/infra/devops-workspace", "/write/infra-devops-workspace"),
}

# Audit entries go to stdout (-> `docker logs paperclip-devops-proxy-scoped-1`,
# captured by the container's json-file log driver) rather than a host file.
# devops-workspace has no allowlisted path to this container's own logs or
# any bind that could touch them, so it cannot tamper with its own audit
# trail -- and this needs no new host bind on the broker container itself,
# so deploying it is a script-content change + restart, not a recreate.

# Known service container names devops-workspace legitimately restarts.
# cos-bridge is included here deliberately: restart alone reuses the
# already-running container's existing config, it cannot inject a new
# image or new binds, so it is not the create-time privilege-escalation
# vector this broker exists to close.
RESTART_ALLOWLIST = {
    "paperclip-cos-1",
    "paperclip-cos-bridge-1",
    "uptime-kuma-1",
    "resourcespace",
    "resourcespace-db",
    "paperclip-publish-dispatcher-1",
    "paperclip-directus-backup-1",
    "vinomartino-nl-redirect-1",
    # LAT-3210: approved via board approval c1960763.
    "paperclip-monitor-1",
}

# LAT-3591: orphaned vino-build containers (deploy.yml's `docker run --rm
# --network directus_directus_net -v /srv/vino-builds/<run_id>:/app node:24
# ...`) have no --name, so a name-based ACL can't target them -- the LAT-3441
# incident's 7 orphans all had random Docker names. Instead this matches on
# what deploy.yml's invocation actually looks like at runtime: exact image,
# a bind sourced under /srv/vino-builds/, and still running. No infra
# container can satisfy all three -- stop/kill also can't inject an image or
# bind the way /containers/create can, so it isn't the escalation route this
# broker exists to close (same reasoning RESTART_ALLOWLIST already relies on).
VINO_BUILD_IMAGE = "node:24"
VINO_BUILD_BIND_PREFIX = "/srv/vino-builds/"

RE_CONTAINER_JSON = re.compile(r"^/containers/[^/]+/json$")
RE_CONTAINER_CREATE = re.compile(r"^/containers/create$")
RE_CONTAINER_RESTART = re.compile(r"^/containers/([^/]+)/restart$")
RE_CONTAINER_START = re.compile(r"^/containers/([^/]+)/start$")
RE_CONTAINER_STOP = re.compile(r"^/containers/([^/]+)/stop$")
RE_CONTAINER_KILL = re.compile(r"^/containers/([^/]+)/kill$")

# The real docker CLI negotiates an API version against /version on first use
# and prefixes every subsequent request with it (e.g. POST /v1.24/build,
# POST /v1.51/containers/create) -- it never sends the bare, version-less
# paths above. Route matching (and do_GET's RE_CONTAINER_JSON deny-check)
# must see past that prefix or every real docker-CLI request falls through
# to the deny-by-default branch regardless of the chunked-body fix. Verified
# empirically (LAT-4772): `docker build` sends
# `POST /v1.24/build?buildargs=...`, not `POST /build`.
RE_API_VERSION_PREFIX = re.compile(r"^/v[0-9]+\.[0-9]+(?=/)")


def _route_path(raw_path):
    """Strip a leading docker API version segment for route matching only.

    The original `raw_path` (with the version prefix intact, if any) is
    still what gets forwarded upstream -- this normalization is purely so
    the allowlist regexes recognize what the real client actually sends.
    """
    return RE_API_VERSION_PREFIX.sub("", raw_path, count=1)

# Container IDs this broker itself just created via an already-validated
# /containers/create (i.e. _binds_ok already passed). /start cannot attach a
# new bind -- Docker fixes HostConfig.Binds at create time -- so allowing
# start for these IDs adds no new host-path exposure. It is NOT a general
# "start anything" grant: an arbitrary existing/stopped container name/ID
# (e.g. an old, differently-configured proxy container) is never in this set,
# so it stays 403 same as before. One-shot: popped on use so a leaked ID from
# a finished create can't be started twice.
_startable_ids_lock = threading.Lock()
_startable_ids = set()


def _is_docker_sock(path):
    p = path.rstrip("/")
    return p == "/var/run/docker.sock" or p.endswith("/var/run/docker.sock")


def _binds_ok(host_config):
    if not host_config:
        return True
    for b in host_config.get("Binds") or []:
        parts = b.split(":")
        if len(parts) < 2:
            return False
        src, dst = parts[0], parts[1]
        if _is_docker_sock(src) or _is_docker_sock(dst):
            return False
        if not src.startswith("/"):
            continue  # named volume, not a host path -- allowed unconditionally
        if (src, dst) not in HOST_BIND_ALLOWLIST:
            return False
    for m in host_config.get("Mounts") or []:
        src, dst = m.get("Source", ""), m.get("Target", "")
        if _is_docker_sock(src) or _is_docker_sock(dst):
            return False
        if m.get("Type") not in (None, "bind"):
            continue  # named volume / tmpfs, not a host path
        if src and not src.startswith("/"):
            continue
        if src and (src, dst) not in HOST_BIND_ALLOWLIST:
            return False
    return True


def _matched_audited_binds(host_config):
    matched = []
    if not host_config:
        return matched
    for b in host_config.get("Binds") or []:
        parts = b.split(":")
        if len(parts) < 2:
            continue
        pair = (parts[0], parts[1])
        if pair in AUDITED_BINDS:
            matched.append(pair)
    for m in host_config.get("Mounts") or []:
        pair = (m.get("Source", ""), m.get("Target", ""))
        if pair in AUDITED_BINDS:
            matched.append(pair)
    return matched


def _audit_write(handler, payload, matched_binds):
    entry = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "remote_addr": handler.client_address[0] if handler.client_address else "unknown",
        "agent_id": handler.headers.get("X-Paperclip-Agent-Id", "unknown"),
        "issue_id": handler.headers.get("X-Paperclip-Issue-Id", "unknown"),
        "run_id": handler.headers.get("X-Paperclip-Run-Id", "unknown"),
        "image": payload.get("Image", "unknown"),
        "cmd": str(payload.get("Cmd"))[:500],
        "binds": [f"{s}:{d}" for s, d in matched_binds],
    }
    # AUDIT prefix makes this greppable in `docker logs` independent of the
    # regular per-request log_message lines.
    print("scoped-broker: AUDIT " + json.dumps(entry), flush=True)


def _get_upstream_container_json(container_id):
    """Server-to-upstream inspect call, direct to the real docker socket proxy.

    This is NOT the client-facing GET /containers/<id>/json route (that stays
    denied below, unchanged) -- it's this broker's own internal lookup, same
    trust boundary as the create/restart forwarding it already does.
    """
    conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=10)
    try:
        conn.request("GET", "/containers/%s/json" % container_id)
        resp = conn.getresponse()
        data = resp.read()
        if resp.status != 200:
            return None
        return json.loads(data)
    except Exception:
        return None
    finally:
        conn.close()


def _is_orphaned_vino_build(container_id):
    info = _get_upstream_container_json(container_id)
    if not info:
        return False
    if (info.get("Config") or {}).get("Image") != VINO_BUILD_IMAGE:
        return False
    if not (info.get("State") or {}).get("Running"):
        return False
    host_config = info.get("HostConfig") or {}
    for b in host_config.get("Binds") or []:
        src = b.split(":")[0] if b else ""
        if src.startswith(VINO_BUILD_BIND_PREFIX):
            return True
    for m in info.get("Mounts") or []:
        if (m.get("Source") or "").startswith(VINO_BUILD_BIND_PREFIX):
            return True
    return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _deny(self, code=403, msg=b"scoped broker: forbidden"):
        self._drain_request_body()
        self.send_response(code)
        self.send_header("Content-Length", str(len(msg)))
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(msg)

    def _forward(self, body=None):
        self._forward_capture(body)

    def _forward_capture(self, body=None):
        """Like _forward, but also returns (status, data) to the caller."""
        conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=30)
        try:
            # Transfer-Encoding/Content-Length are stripped here: `body` is
            # always already a fully-decoded bytes object (or None) by the
            # time it reaches this point, never a raw chunked stream, so
            # http.client must compute its own framing rather than forward
            # the original request's now-stale header.
            headers = {
                k: v for k, v in self.headers.items()
                if k.lower() not in ("host", "transfer-encoding", "content-length")
            }
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() in ("transfer-encoding", "connection"):
                    continue
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return resp.status, data
        finally:
            conn.close()

    def _read_chunked_body(self):
        """Decode a Transfer-Encoding: chunked request body from self.rfile.

        Docker CLI sends build contexts chunked, never with Content-Length.
        Raises ValueError on any malformed chunk framing -- callers must
        treat that as fatal for the connection (see _deny/close_connection),
        because a partially-read chunked stream leaves undrained bytes on
        the socket that BaseHTTPRequestHandler would otherwise misparse as
        the start of a bogus next request (LAT-4772 defect 1).
        """
        chunks = []
        while True:
            size_line = self.rfile.readline(65538)
            if not size_line:
                raise ValueError("connection closed mid-chunk-header")
            size_str = size_line.split(b";", 1)[0].strip()
            try:
                size = int(size_str, 16)
            except ValueError:
                raise ValueError("bad chunk-size line %r" % size_line)
            if size == 0:
                while True:
                    trailer_line = self.rfile.readline(65538)
                    if trailer_line in (b"\r\n", b"\n", b""):
                        break
                break
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError("short read in chunk body")
            if self.rfile.read(2) != b"\r\n":
                raise ValueError("missing CRLF chunk terminator")
            chunks.append(data)
        return b"".join(chunks)

    def _drain_request_body(self):
        """Consume any not-yet-read request body before a response that
        doesn't otherwise read one (every _deny() path). Leaving it unread
        on a keep-alive connection is exactly LAT-4772 defect 1's cause."""
        if getattr(self, "_body_consumed", False):
            return
        self._body_consumed = True
        try:
            te = self.headers.get("Transfer-Encoding", "")
            if te and "chunked" in te.lower():
                self._read_chunked_body()
            else:
                length = int(self.headers.get("Content-Length", 0) or 0)
                if length:
                    self.rfile.read(length)
        except (ValueError, OSError):
            self.close_connection = True

    def _read_body(self):
        self._body_consumed = True
        te = self.headers.get("Transfer-Encoding", "")
        chunked = bool(te) and "chunked" in te.lower()
        if chunked and "Content-Length" in self.headers:
            # Conflicting framing headers -- classic request-smuggling
            # signal. Refuse rather than guess which one the upstream will
            # honor.
            raise ValueError("both Content-Length and Transfer-Encoding present")
        if chunked:
            return self._read_chunked_body()
        length = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(length) if length else b""

    def do_GET(self):
        path = _route_path(self.path.split("?", 1)[0])
        if RE_CONTAINER_JSON.match(path):
            self._deny()
            return
        # containers/json (list), images, volumes, networks reads, version,
        # ping all pass through unchanged -- same read-only surface as the
        # LAT-2986 broker allows.
        self._forward()

    def do_POST(self):
        path = _route_path(self.path.split("?", 1)[0])
        try:
            body = self._read_body()
        except ValueError as exc:
            # Never guess at a malformed/ambiguous body -- fail loudly and
            # close rather than risk forwarding a desynced or smuggled
            # request. This is the honest alternative the issue asks for
            # in place of a silent 0-byte forward.
            self.close_connection = True
            self._deny(400, ("scoped broker: malformed body: %s" % exc).encode())
            return

        if RE_CONTAINER_CREATE.match(path):
            try:
                payload = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self._deny(400, b"scoped broker: invalid json body")
                return
            host_config = payload.get("HostConfig")
            if not _binds_ok(host_config):
                self._deny()
                return
            matched_audited = _matched_audited_binds(host_config)
            if matched_audited:
                _audit_write(self, payload, matched_audited)
            status, data = self._forward_capture(body)
            if status == 201:
                try:
                    new_id = json.loads(data).get("Id")
                except (json.JSONDecodeError, AttributeError):
                    new_id = None
                if new_id:
                    with _startable_ids_lock:
                        _startable_ids.add(new_id)
            return

        m = RE_CONTAINER_START.match(path)
        if m:
            cid = m.group(1)
            with _startable_ids_lock:
                allowed = cid in _startable_ids
                if allowed:
                    _startable_ids.discard(cid)
            if not allowed:
                self._deny()
                return
            self._forward(body)
            return

        m = RE_CONTAINER_RESTART.match(path)
        if m:
            name = m.group(1)
            if name not in RESTART_ALLOWLIST:
                self._deny()
                return
            self._forward(body)
            return

        m = RE_CONTAINER_STOP.match(path) or RE_CONTAINER_KILL.match(path)
        if m:
            container_id = m.group(1)
            if not _is_orphaned_vino_build(container_id):
                self._deny()
                return
            self._forward(body)
            return

        if path == "/build":
            # Building an image alone cannot mount a host path or run
            # anything; the gate is at /containers/create time above.
            self._forward(body)
            return

        self._deny()

    def do_DELETE(self):
        self._deny()

    def do_PUT(self):
        self._deny()

    def do_HEAD(self):
        self._deny()

    def log_message(self, fmt, *args):
        print("scoped-broker: " + (fmt % args))


class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True
    address_family = socket.AF_INET


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    print(f"scoped-broker listening on :{LISTEN_PORT}, upstream {UPSTREAM_HOST}:{UPSTREAM_PORT}")
    srv.serve_forever()
