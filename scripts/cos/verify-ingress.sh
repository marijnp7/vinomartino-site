#!/usr/bin/env bash
# LAT-2811 — ingress-verificatie voor de Cloudflare-tunnel (paperclip-cloudflared-1).
#
# "Tunnel is up" is niet hetzelfde als "ingress werkt". De tunnel hangt in drie
# docker-netwerken en elke ingress-regel resolvet zijn origin via docker-DNS in
# precies één daarvan. Valt een netwerk weg bij een recreate, dan blijft de
# tunnel geregistreerd en gaat alleen dát hostname stuk:
#
#   hostname                      origin                              netwerk
#   ----------------------------- ----------------------------------- --------------------------
#   deploy-hook.vinomartino.com   cos-bridge:3200                     paperclip_default
#   approval.vinomartino.com      cos-bridge:3200                     paperclip_default
#   webhook.vinomartino.com       paperclip:3100                      paperclip_default
#   dam.vinomartino.com           resourcespace:80                    paperclip_default
#   cms.vinomartino.com           vinomartino-directus-1:8055         directus_directus_net
#   preview.vinomartino.com       paperclip-vinomartino-preview-1:80  vinomartino-site_default
#
# Statuscodes worden niet hardcoded — sommige hostnames zitten achter basic auth
# of een service token. In plaats daarvan: baseline vóór het venster, vergelijk
# erna. Een verschil is het signaal, niet de absolute code.
#
# Gebruik:
#   scripts/cos/verify-ingress.sh baseline            # vóór de recreate
#   scripts/cos/verify-ingress.sh check <baselinefile> # erna
#
# Draaien vanaf een host die de publieke hostnames kan resolven. De netwerk-
# checks vereisen daarnaast toegang tot de docker-API van de VPS.

set -uo pipefail

HOSTS=(
  deploy-hook.vinomartino.com
  approval.vinomartino.com
  webhook.vinomartino.com
  dam.vinomartino.com
  cms.vinomartino.com
  preview.vinomartino.com
)

NETWORKS=(
  paperclip_default
  directus_directus_net
  vinomartino-site_default
)

CONTAINER=paperclip-cloudflared-1

probe() {
  for h in "${HOSTS[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$h/" || echo 000)
    printf '%s %s\n' "$h" "$code"
  done
}

check_networks() {
  local rc=0 attached
  attached=$(docker inspect "$CONTAINER" \
    --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)
  for n in "${NETWORKS[@]}"; do
    if printf '%s' "$attached" | grep -qw -- "$n"; then
      echo "OK   netwerk $n"
    else
      echo "FAIL netwerk $n ontbreekt op $CONTAINER"
      rc=1
    fi
  done
  return $rc
}

check_image() {
  # De definitie pint op digest. Wijkt de draaiende container daarvan af, dan is
  # er ergens een ongeplande versie-bump gebeurd.
  docker inspect "$CONTAINER" --format 'image: {{.Config.Image}}'
}

case "${1:-}" in
  baseline)
    out="${2:-/tmp/lat2811-ingress-baseline.txt}"
    probe | tee "$out"
    echo "--- baseline weggeschreven naar $out ---"
    ;;

  check)
    base="${2:-/tmp/lat2811-ingress-baseline.txt}"
    if [ ! -f "$base" ]; then
      echo "FAIL baseline $base niet gevonden — draai eerst 'baseline'" >&2
      exit 1
    fi
    now=$(mktemp)
    probe >"$now"

    echo "=== netwerken ==="
    net_rc=0
    check_networks || net_rc=1
    check_image

    echo
    echo "=== ingress (baseline vs nu) ==="
    diff_rc=0
    if diff -u "$base" "$now"; then
      echo "OK   alle $((${#HOSTS[@]})) hostnames geven dezelfde statuscode als vóór het venster"
    else
      echo "FAIL ingress-statuscodes zijn veranderd (zie diff hierboven)"
      diff_rc=1
    fi
    rm -f "$now"

    [ $net_rc -eq 0 ] && [ $diff_rc -eq 0 ] || exit 1
    echo
    echo "ALLES OK"
    ;;

  *)
    echo "gebruik: $0 baseline [outfile] | check [baselinefile]" >&2
    exit 2
    ;;
esac
