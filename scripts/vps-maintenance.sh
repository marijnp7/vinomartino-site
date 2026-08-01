#!/usr/bin/env bash
# scripts/vps-maintenance.sh — /srv/vino-builds stage-dir housekeeping (LAT-3214)
#
# Draait ÓP DE VPS. Bedoeld om via ssh gevoerd te worden:
#   ssh "$VPS" 'MODE=report bash -s' < scripts/vps-maintenance.sh
#
# Waarom dit bestaat
# ------------------
# deploy.yml en publish.yml bouwen de site in een per-run bind-mount
# /srv/vino-builds/<run_id>. `npm ci` draait ín die mount, dus node_modules
# landen rechtstreeks op de hostschijf — onzichtbaar voor `docker system df`
# en `docker ps -s`, want bind-mounts tellen niet mee in de container layer size.
#
# Beide workflows hebben al een `if: always()` cleanup (LAT-1326):
#     find /srv/vino-builds -mindepth 1 -maxdepth 1 -type d -mmin +1440 -exec rm -rf {} +
# Die heeft twee gaten, allebei geraakt door het geval van LAT-3205/LAT-3214:
#
#   1. Faalt de SSH zelf, dan draait de cleanup niet. Gebeurde live op
#      2026-08-01 (run 30689261783: "ssh: connect to host port 22: Connection
#      timed out" -> "Staging-cleanup overgeslagen").
#   2. `-mmin` kijkt naar de mtime van de map. Een build die HANGT maar nog
#      DRAAIT blijft in zijn stage schrijven, dus de mtime veroudert nooit
#      voorbij 1440 min. De opruimer slaat precies het geval over dat het
#      meeste kost — container sharp_hellman hing 7 dagen met zijn stage
#      nog aan de schijf.
#
# Leeftijd is het verkeerde criterium. Het juiste criterium is "houdt een
# DRAAIENDE container deze map nog vast", en dat is gewoon op te vragen met
# `docker inspect`. Dat doet dit script.
#
# Env:
#   MODE=report|prune     report (default) meet alleen, verwijdert niets
#   STOP_HUNG=true|false  stop build-containers ouder dan MAX_HOURS (default false)
#   MAX_HOURS=<n>         vanaf hoeveel uur een build als vastgelopen geldt (default 6)
#   ROOT=<pad>            stage-root (default /srv/vino-builds)

set -uo pipefail

ROOT="${ROOT:-/srv/vino-builds}"
MODE="${MODE:-report}"
STOP_HUNG="${STOP_HUNG:-false}"
MAX_HOURS="${MAX_HOURS:-6}"

case "$MODE" in
  report|prune) ;;
  *) echo "FOUT: MODE moet 'report' of 'prune' zijn, niet '$MODE'" >&2; exit 2 ;;
esac

if [ ! -d "$ROOT" ]; then
  echo "FOUT: $ROOT bestaat niet" >&2
  exit 2
fi

echo "=================================================="
echo "vps-maintenance  MODE=$MODE  STOP_HUNG=$STOP_HUNG  MAX_HOURS=$MAX_HOURS"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

echo "## df BEFORE"
df -h / | tail -1
echo

# Print per draaiende container de stage-dirs die hij vasthoudt.
# Formaat per regel: "<container-naam> <leeftijd-in-uren> <stage-pad>"
stage_holders() {
  local now c name started age src
  now=$(date +%s)
  for c in $(docker ps -q); do
    src=$(docker inspect \
            -f '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{println}}{{end}}{{end}}' \
            "$c" 2>/dev/null | grep "^${ROOT}/" || true)
    [ -z "$src" ] && continue
    name=$(docker inspect -f '{{.Name}}' "$c" 2>/dev/null | sed 's|^/||')
    started=$(docker inspect -f '{{.State.StartedAt}}' "$c" 2>/dev/null)
    age=$(( (now - $(date -d "$started" +%s)) / 3600 ))
    while IFS= read -r s; do
      [ -n "$s" ] && echo "$name $age $s"
    done <<< "$src"
  done
}

echo "## Containers die een stage vasthouden"
holders=$(stage_holders)
if [ -n "$holders" ]; then
  echo "$holders" | while read -r n a s; do echo "  $n  age=${a}h  $s"; done
else
  echo "  (geen)"
fi
echo

# ---- Vastgelopen builds stoppen -------------------------------------------
if [ "$STOP_HUNG" = "true" ] && [ -n "$holders" ]; then
  echo "## Vastgelopen builds stoppen (>= ${MAX_HOURS}h)"
  while read -r name age stage; do
    [ -z "$name" ] && continue
    if [ "$age" -ge "$MAX_HOURS" ]; then
      echo "  STOP $name (age=${age}h, stage=$stage)"
      echo "  --- laatste 20 logregels ---"
      docker logs --tail 20 "$name" 2>&1 | sed 's/^/      /'
      if docker stop -t 30 "$name" >/dev/null 2>&1; then
        echo "  gestopt: $name"
      else
        echo "  STOP MISLUKT: $name"
      fi
    else
      echo "  laat draaien: $name (age=${age}h < ${MAX_HOURS}h)"
    fi
  done <<< "$holders"
  echo
fi

# ---- Actieve set OPNIEUW bepalen, ná het stoppen --------------------------
# Cruciaal: als we hierboven iets gestopt hebben, is die stage nu wél
# opruimbaar. Hergebruik van de oude lijst laat precies de map staan die we
# net hebben vrijgemaakt.
ACTIVE=$(stage_holders | awk '{print $3}' | sort -u)

echo "## Stages met een draaiende container (worden NOOIT verwijderd)"
if [ -n "$ACTIVE" ]; then echo "$ACTIVE" | sed 's/^/  /'; else echo "  (geen)"; fi
echo

echo "## du -sh $ROOT/* (top 30)"
du -sh "$ROOT"/* 2>/dev/null | sort -rh | head -30
echo "## TOTAAL"
du -sh "$ROOT" 2>/dev/null
echo

echo "## Leeftijd van de stages (mtime, ouder dan 60 min)"
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -mmin +60 \
  -printf '%T@ %TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null | sort -n
echo

# ---- Prune -----------------------------------------------------------------
if [ "$MODE" = "prune" ]; then
  echo "## PRUNE — verweesde stages verwijderen"
  freed=0
  for d in "$ROOT"/*; do
    [ -d "$d" ] || continue
    if [ -n "$ACTIVE" ] && printf '%s\n' "$ACTIVE" | grep -qxF "$d"; then
      echo "  OVERSLAAN (actief): $d"
      continue
    fi
    sz=$(du -sm "$d" 2>/dev/null | cut -f1)
    sz=${sz:-0}
    if rm -rf "$d" 2>/dev/null; then
      echo "  verwijderd: $d (${sz}MB)"
    else
      # De map zelf kan 'busy' zijn als hij nog bind-mount is van een
      # gestopte-maar-niet-verwijderde container; de inhoud is dan wel weg.
      echo "  inhoud gewist, mountpoint busy: $d (${sz}MB)"
    fi
    freed=$((freed + sz))
  done
  echo "  ~${freed}MB opgeruimd"
else
  echo "## mode=report — er is niets verwijderd"
fi
echo

echo "## df AFTER"
df -h / | tail -1
echo "=================================================="
