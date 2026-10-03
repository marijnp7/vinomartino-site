#!/usr/bin/env bash
# ProxyCommand voor GitHub Actions -> VPS SSH via de Cloudflare Tunnel (LAT-3437).
# Vervangt de inbound TCP-connect naar poort 22, die fail2ban op GitHub's gedeelde
# runner-IP-pool blokkeerde (LAT-3428). Auth: Access service token, geen e-mailpolicy.
#
# Gebruik (door de "Configure SSH"-stap in ~/.ssh/config gezet):
#   ProxyCommand bash <workspace>/ops/cf-ssh-proxy.sh
# Credentials: ~/.ssh/cf-access.env (CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET, 0600).
# Debuggen: runbook in LAT-3437 (issue-document "runbook").
set -euo pipefail
CF_VERSION=2026.9.3
CF_SHA256=77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2
HOSTNAME_SSH="${CF_SSH_HOSTNAME:-ssh.vinomartino.com}"
ENV_FILE="${CF_ACCESS_ENV_FILE:-$HOME/.ssh/cf-access.env}"
BIN="${CF_BIN_DIR:-$HOME/.cache/cf-ssh}/cloudflared-$CF_VERSION"

if [ ! -x "$BIN" ]; then
  mkdir -p "$(dirname "$BIN")"
  TMP="$BIN.$$"
  curl -fsSL --retry 3 --max-time 120 -o "$TMP" \
    "https://github.com/cloudflare/cloudflared/releases/download/$CF_VERSION/cloudflared-linux-amd64" >&2
  echo "$CF_SHA256  $TMP" | sha256sum -c - >&2 || { rm -f "$TMP"; echo "cloudflared checksum mismatch" >&2; exit 1; }
  chmod +x "$TMP"; mv -f "$TMP" "$BIN"
fi

set -a; . "$ENV_FILE"; set +a
export TUNNEL_SERVICE_TOKEN_ID="$CF_ACCESS_CLIENT_ID" TUNNEL_SERVICE_TOKEN_SECRET="$CF_ACCESS_CLIENT_SECRET"
exec "$BIN" access ssh --hostname "$HOSTNAME_SSH"
