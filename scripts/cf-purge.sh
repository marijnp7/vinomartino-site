#!/usr/bin/env bash
# LAT-2701 / LAT-3213 — Cloudflare edge-cache purge na een geverifieerde prod-deploy.
#
# Draait op de VPS-host, aangeroepen vanuit deploy.yml. De bijbehorende stap
# hoort direct ná "Smoke test" en vóór "Done" te staan, en is bewust de hele
# YAML-kant — er zit geen logica meer in de workflow:
#
#     - name: Purge Cloudflare edge cache (prod)
#       if: steps.env.outputs.target == 'production'
#       env:
#         VPS: ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }}
#       run: ssh "$VPS" 'bash -s' < scripts/cf-purge.sh
#
# (De repo is op dat punt in de job al uitgecheckt via actions/checkout@v4, en
# de SSH-agent staat al klaar van de eerdere rsync-stappen.)
#
# Het CF-token staat bewust NIET in GHA-secrets maar op de VPS in
# /root/.agent-secrets/cloudflare.env (CF_API_TOKEN + CF_ZONE_ID) — conform de
# pipeline-posture van de rest van deze deploy.
#
# ── Waarom dit een script is en geen inline YAML-blok ──────────────────────
# `.github/workflows/*` is voor agents niet schrijfbaar (de publish-PAT mist de
# `workflow`-scope; GitHub weigert de push). Alles wat de workflow *aanroept*
# is dat wel. Door de logica hier te zetten is de YAML-kant eenmalig en kunnen
# latere wijzigingen aan het purge-gedrag zonder mensen-gate landen.
#
# ── Waarom niet-fataal ────────────────────────────────────────────────────
# Gemeten 2026-08-01 07:17Z op productie: alle HTML-routes komen als
# cf-cache-status DYNAMIC terug en assets zijn content-hashed + immutable. Een
# mislukte purge levert vandaag dus geen stale bezoekerscontent op. Een rode
# deploy op een purge-fout kost meer dan hij oplevert: de deploy zelf is dan al
# geverifieerd geslaagd. Detectie van de echte faalmodus hoort bij de
# edge-cache-waakhond (LAT-3210), niet bij een exit-code hier.
# Zet CF_PURGE_STRICT=1 om er alsnog een harde fout van te maken.
#
# Env-overrides (allemaal optioneel, defaults zijn de productiewaarden):
#   CF_ENV_FILE       pad naar de env-file      (default /root/.agent-secrets/cloudflare.env)
#   CF_PURGE_STRICT   1 = fail de deploy        (default 0 = waarschuw en ga door)
#   CF_API_BASE       Cloudflare API-root       (default https://api.cloudflare.com/client/v4)
#   CF_PURGE_RETRIES  aantal pogingen           (default 3)
#   CF_PURGE_SLEEP    seconden tussen pogingen  (default 4)
#
# Exit: 0, tenzij CF_PURGE_STRICT=1 en de purge niet lukte (dan 1).

set -uo pipefail

CF_ENV_FILE="${CF_ENV_FILE:-/root/.agent-secrets/cloudflare.env}"
CF_PURGE_STRICT="${CF_PURGE_STRICT:-0}"
CF_API_BASE="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"
CF_PURGE_RETRIES="${CF_PURGE_RETRIES:-3}"
CF_PURGE_SLEEP="${CF_PURGE_SLEEP:-4}"

# Geeft de reden door als GitHub-annotatie en bepaalt de exit-code op basis van
# CF_PURGE_STRICT. Eén plek, zodat "niet-fataal" niet per faalpad kan afwijken.
fail() {
  local msg="$1"
  if [ "$CF_PURGE_STRICT" = "1" ]; then
    echo "::error::CF-purge: $msg (strict-modus — deploy faalt, LAT-2701)"
    exit 1
  fi
  echo "::warning::CF-purge overgeslagen/mislukt: $msg — deploy blijft groen. Edge serveert HTML als DYNAMIC (gemeten 01-08), dus geen stale-venster verwacht; detectie loopt via LAT-3210."
  exit 0
}

if [ ! -r "$CF_ENV_FILE" ]; then
  fail "$CF_ENV_FILE niet leesbaar op de VPS"
fi

set -a
# shellcheck disable=SC1090
. "$CF_ENV_FILE"
set +a

if [ -z "${CF_API_TOKEN:-}" ] || [ -z "${CF_ZONE_ID:-}" ]; then
  fail "CF_API_TOKEN of CF_ZONE_ID ontbreekt in $CF_ENV_FILE"
fi

last_resp=""
attempt=1
while [ "$attempt" -le "$CF_PURGE_RETRIES" ]; do
  last_resp=$(curl -sS --max-time 20 -X POST \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' \
    "$CF_API_BASE/zones/$CF_ZONE_ID/purge_cache" 2>&1 || echo '{"success":false}')

  if printf '%s' "$last_resp" | grep -qE '"success":[[:space:]]*true'; then
    echo "::notice::Cloudflare-cache gepurged voor zone $CF_ZONE_ID (poging $attempt)"
    exit 0
  fi

  # Token-fouten (10000 / expired) herstellen niet vanzelf binnen deze loop —
  # meteen stoppen scheelt 2x CF_PURGE_SLEEP aan deploy-tijd. Zie LAT-3197.
  if printf '%s' "$last_resp" | grep -qE '"code":[[:space:]]*(10000|9109)\b'; then
    fail "CF-token afgewezen (auth-fout, zie LAT-3197): $last_resp"
  fi

  echo "CF-purge poging $attempt/$CF_PURGE_RETRIES faalde: $last_resp"
  attempt=$((attempt + 1))
  [ "$attempt" -le "$CF_PURGE_RETRIES" ] && sleep "$CF_PURGE_SLEEP"
done

fail "purge faalde na $CF_PURGE_RETRIES pogingen — laatste respons: $last_resp"
