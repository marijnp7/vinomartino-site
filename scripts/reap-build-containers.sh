#!/usr/bin/env bash
# scripts/reap-build-containers.sh — wees-buildcontainers opruimen (LAT-4968)
#
# Draait ÓP DE VPS. Bedoeld om via ssh gevoerd te worden, net als
# scripts/vps-maintenance.sh:
#
#   ssh "$VPS" "SELF='vino-build-123' MODE=reap bash -s" < scripts/reap-build-containers.sh
#
# Waarom dit bestaat
# ------------------
# deploy.yml / publish.yml / i18n-nl-gate.yml bouwen de site in
# `docker run --rm ... -v /srv/vino-builds/<run_id>:/app node:24`. Als de GHA-job
# zijn `timeout-minutes` haalt, kilt de runner de ssh-client en sterft de
# docker-CLI mee — maar de container is een kind van de docker-*daemon* op de VPS
# en blijft gewoon draaien. `--rm` vuurt dan nooit. Het resultaat is een wees die
# CPU en schijf houdt, de volgende build trager maakt, en dus de kans op de
# volgende timeout vergroot: een zichzelf versterkende lus
# (LAT-3138 → LAT-3441 → LAT-4954/4966/4967).
#
# De bestaande opruimer in deploy.yml,
#     find /srv/vino-builds -mindepth 1 -maxdepth 1 -type d -mmin +1440 -exec rm -rf {} +
# kan die wees per definitie niet raken: de nog LEVENDE container schrijft in de
# stage, dus de mtime wordt nooit ouder dan 1440 min. Leeftijd van de *map* is het
# verkeerde criterium; de container zelf is het juiste (zelfde inzicht als
# scripts/vps-maintenance.sh, LAT-3214).
#
# Wat telt als wees
# -----------------
#   1. SELF — de container van DEZE run. Die is per definitie klaar tegen de tijd
#      dat de `if: always()`-reaper draait: óf de build eindigde (en `--rm` heeft
#      hem al opgeruimd, `docker rm` geeft dan simpelweg "No such container"), óf
#      de job is afgekapt en dan is dit exact de wees die we willen killen. Geen
#      leeftijdsdrempel op deze — hij is van ons.
#
#   2. Elke ANDERE container met een bind-mount onder $ROOT die langer dan
#      MAX_AGE_MIN draait.
#
# Waarom een leeftijdsdrempel op (2), en niet "alles wat niet van mij is"
# ----------------------------------------------------------------------
# LAT-4968 ging ervan uit dat alle build-workflows via concurrency-group
# `vinomartino-write` geserialiseerd zijn, zodat élke vreemde container per
# definitie een wees is. Dat klopt voor deploy.yml en publish.yml, maar NIET voor
# i18n-nl-gate.yml: die gebruikt `group: i18n-gate-pr-<pr-nummer>`, dus twee PR's
# bouwen tegelijk, en een gate-run kan naast een deploy draaien. "Kill alles wat
# niet van mij is" zou daar een levende build van een andere PR slopen en die
# check rood maken zonder dat er iets mis is.
#
# MAX_AGE_MIN is geen natte-vinger-drempel maar afgeleid van de job-cap: de hoogste
# `timeout-minutes` van de drie workflows is 30 (deploy.yml, i18n-nl-gate.yml;
# publish.yml build-preview staat op 20). De container start pas ná checkout en
# rsync, dus een container van een LEVENDE run is altijd jonger dan die 30 min.
# Alles daarboven kan niet bij een lopende run horen. Default 40 = 30 + 10 marge.
# Verhoog je ergens `timeout-minutes`, verhoog dan hier mee.
#
# Bewust GEEN filter op `Image == node:24`: de bind-mount onder $ROOT is al
# sluitend, en een image-filter zou stilzwijgend stoppen met matchen zodra de
# build naar node:26 gaat. Wezen van vóór deze fix hebben willekeurige namen
# (`zealous_bardeen`, `gallant_fermi`, `angry_shamir`) en worden juist dankzij het
# mount-criterium wél gevangen.
#
# Env:
#   MODE=report|reap    report (default) meet alleen en verwijdert niets
#   SELF=<naam>         containernaam van deze run (leeg = alleen vreemde wezen)
#   MAX_AGE_MIN=<n>     vanaf hoeveel minuten een vreemde container een wees is (40)
#   ROOT=<pad>          stage-root (default /srv/vino-builds)
#   RM_DIRS=true|false  ook de stage-map van een gereapte container wissen (true)
#   DOCKER_BIN=<pad>    docker-binary (test-hook)
#
# Exit-code is altijd 0 tenzij de aanroep zelf fout is (2): een falende opruimer
# mag de status van de build-run niet maskeren.

set -uo pipefail

ROOT="${ROOT:-/srv/vino-builds}"
MODE="${MODE:-report}"
SELF="${SELF:-}"
MAX_AGE_MIN="${MAX_AGE_MIN:-40}"
RM_DIRS="${RM_DIRS:-true}"
DOCKER_BIN="${DOCKER_BIN:-docker}"

case "$MODE" in
  report|reap) ;;
  *) echo "FOUT: MODE moet 'report' of 'reap' zijn, niet '$MODE'" >&2; exit 2 ;;
esac
case "$ROOT" in
  /*/*) ;;
  *) echo "FOUT: ROOT moet een absoluut pad van minstens twee niveaus zijn, niet '$ROOT'" >&2; exit 2 ;;
esac
if ! printf '%s' "$MAX_AGE_MIN" | grep -qE '^[0-9]+$'; then
  echo "FOUT: MAX_AGE_MIN moet een geheel getal zijn, niet '$MAX_AGE_MIN'" >&2; exit 2
fi

echo "=================================================="
echo "reap-build-containers  MODE=$MODE  SELF=${SELF:-<geen>}  MAX_AGE_MIN=$MAX_AGE_MIN  ROOT=$ROOT"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! command -v "$DOCKER_BIN" >/dev/null 2>&1; then
  echo "::warning::$DOCKER_BIN niet gevonden — reaper doet niets"
  exit 0
fi

now=$(date +%s)

# Per container met een bind-mount onder $ROOT één regel:
#   <naam> <leeftijd-in-minuten> <stage-pad>
candidates() {
  local c name started age src s
  for c in $("$DOCKER_BIN" ps -a -q 2>/dev/null); do
    src=$("$DOCKER_BIN" inspect \
            -f '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{println}}{{end}}{{end}}' \
            "$c" 2>/dev/null | grep "^${ROOT}/" || true)
    [ -z "$src" ] && continue
    name=$("$DOCKER_BIN" inspect -f '{{.Name}}' "$c" 2>/dev/null | sed 's|^/||')
    [ -z "$name" ] && name="$c"
    started=$("$DOCKER_BIN" inspect -f '{{.State.StartedAt}}' "$c" 2>/dev/null)
    age=$(( (now - $(date -d "$started" +%s 2>/dev/null || echo "$now")) / 60 ))
    while IFS= read -r s; do
      [ -n "$s" ] && echo "$name $age $s"
    done <<< "$src"
  done
}

# Wist alleen paden van de vorm $ROOT/<één-segment>. Alles anders is een bug
# in de aanroep en mag nooit een rm -rf worden.
rm_stage() {
  local d="$1"
  case "$d" in
    "$ROOT"/*/*|"$ROOT"/|"$ROOT"|*..*) echo "    OVERGESLAAN (onveilig pad): $d"; return ;;
    "$ROOT"/?*) ;;
    *) echo "    OVERGESLAAN (buiten ROOT): $d"; return ;;
  esac
  if rm -rf "$d" 2>/dev/null; then
    echo "    stage gewist: $d"
  else
    # De map kan 'busy' zijn zolang hij nog bind-mount is van een net gekilde
    # container; de inhoud is dan wel weg.
    echo "    stage-inhoud gewist, mountpoint busy: $d"
  fi
}

found=$(candidates)
if [ -z "$found" ]; then
  echo "## Geen container houdt een stage onder $ROOT vast"
  echo "=================================================="
  exit 0
fi

echo "## Containers met een stage onder $ROOT"
echo "$found" | while read -r n a s; do echo "  $n  age=${a}m  $s"; done
echo

reaped=0
kept=0
while read -r name age stage; do
  [ -z "$name" ] && continue
  reason=""
  if [ -n "$SELF" ] && [ "$name" = "$SELF" ]; then
    reason="eigen run"
  elif [ "$age" -ge "$MAX_AGE_MIN" ]; then
    reason="ouder dan ${MAX_AGE_MIN}m (kan niet bij een lopende run horen)"
  fi

  if [ -z "$reason" ]; then
    echo "  LAAT STAAN: $name (age=${age}m < ${MAX_AGE_MIN}m, vreemde run — mogelijk een levende build)"
    kept=$((kept + 1))
    continue
  fi

  echo "  REAP: $name (age=${age}m, $reason, stage=$stage)"
  if [ "$MODE" != "reap" ]; then
    reaped=$((reaped + 1))
    continue
  fi

  # Logregels bewaren vóór het killen — zonder dit is een hangende build
  # achteraf niet te diagnosticeren (LAT-4966).
  echo "    --- laatste 15 logregels ---"
  "$DOCKER_BIN" logs --tail 15 "$name" 2>&1 | sed 's/^/      /'
  # Killen VÓÓR het wissen van de stage: een levende schrijver zet zijn
  # bestanden terug tijdens de rm -rf (LAT-4968 punt 3).
  if "$DOCKER_BIN" rm -f "$name" >/dev/null 2>&1; then
    echo "    container verwijderd: $name"
  else
    echo "    container al weg (of rm mislukt): $name"
  fi
  [ "$RM_DIRS" = "true" ] && rm_stage "$stage"
  reaped=$((reaped + 1))
done <<< "$found"

echo
echo "## Samenvatting: reaped=$reaped kept=$kept mode=$MODE"
df -h "$ROOT" 2>/dev/null | tail -1
echo "=================================================="
exit 0
