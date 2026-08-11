#!/usr/bin/env bash
# scripts/reap-build-containers.test.sh — LAT-4968
#
# Draait scripts/reap-build-containers.sh tegen een NEP-docker en controleert de
# selectie: welke containers worden gereapt, welke blijven staan. Geen echte
# docker en geen VPS nodig; alles gebeurt in een eigen mktemp-map (nooit een vast
# pad onder /tmp — de hele vloot deelt die namespace).
#
#   bash scripts/reap-build-containers.test.sh
#
# De test is falsifieerbaar opgezet: hij bevat twee fixtures die NIET gereapt
# mogen worden. Zou de reaper terugvallen op "kill alles wat niet van mij is"
# (de oorspronkelijke fix-vorm uit LAT-4968), dan wordt `vino-gate-pr-777` mee
# gesloopt en faalt deze test. Dat is precies de regressie die we willen vangen.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUT="$HERE/reap-build-containers.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/lat4968-reap-test.XXXXXXXX")"
trap 'rm -rf "$WORK"' EXIT

ROOT="$WORK/vino-builds"
BIN="$WORK/bin"
mkdir -p "$ROOT" "$BIN"

# ── Fixtures ────────────────────────────────────────────────────────────────
# id | naam | leeftijd in minuten | mount-source | verwacht
FIXTURES="
c1|vino-build-999|3|$ROOT/999|REAP
c2|vino-gate-pr-777|4|$ROOT/pr-777|KEEP
c3|zealous_bardeen|420|$ROOT/31234|REAP
c4|vino-gate-pr-555|95|$ROOT/pr-555|REAP
c5|vinomartino-directus-1|99999|/srv/directus/data|IGNORE
c6|paperclip-vinomartino-1|99999|/root/vinomartino-site/dist|IGNORE
"

# ── Nep-docker ──────────────────────────────────────────────────────────────
{
  echo '#!/usr/bin/env bash'
  echo 'set -uo pipefail'
  echo "STATE='$WORK/state'"
  echo 'case "$1 ${2:-}" in'
  echo '  "ps -a")'
  echo '    grep -v "^REMOVED " "$STATE" | cut -d"|" -f1 ;;'
  echo '  "inspect -f")'
  echo '    fmt="$3"; id="$4"'
  echo '    line=$(grep "^$id|" "$STATE" | head -1)'
  echo '    [ -z "$line" ] && { echo "Error: No such object: $id" >&2; exit 1; }'
  echo '    name=$(printf "%s" "$line" | cut -d"|" -f2)'
  echo '    agemin=$(printf "%s" "$line" | cut -d"|" -f3)'
  echo '    src=$(printf "%s" "$line" | cut -d"|" -f4)'
  echo '    case "$fmt" in'
  echo '      *Mounts*) printf "%s\n" "$src" ;;'
  echo '      *.Name*)  printf "/%s\n" "$name" ;;'
  echo '      *StartedAt*) date -u -d "@$(( $(date +%s) - agemin * 60 ))" +%Y-%m-%dT%H:%M:%SZ ;;'
  echo '    esac ;;'
  echo '  "logs --tail")'
  echo '    echo "fake log line for ${4:-?}" ;;'
  echo '  "rm -f")'
  echo '    id=$(grep "|${3}|" "$STATE" | head -1 | cut -d"|" -f1)'
  echo '    [ -z "$id" ] && exit 1'
  echo '    echo "REAPED ${3}" >> "$WORK_REAPLOG"'
  echo '    exit 0 ;;'
  echo '  *) echo "nep-docker: onbekend commando: $*" >&2; exit 1 ;;'
  echo 'esac'
} > "$BIN/docker"
sed -i "s|\$WORK_REAPLOG|$WORK/reaped.log|g" "$BIN/docker"
chmod +x "$BIN/docker"

# ── State + stage-mappen aanleggen ──────────────────────────────────────────
: > "$WORK/state"
: > "$WORK/reaped.log"
while IFS='|' read -r id name age src expect; do
  [ -z "${id:-}" ] && continue
  printf '%s|%s|%s|%s\n' "$id" "$name" "$age" "$src" >> "$WORK/state"
  case "$src" in "$ROOT"/*) mkdir -p "$src"; echo x > "$src/marker" ;; esac
done <<< "$FIXTURES"

# ── SUT draaien ─────────────────────────────────────────────────────────────
OUT="$WORK/out.txt"
MODE=reap SELF=vino-build-999 MAX_AGE_MIN=40 ROOT="$ROOT" \
  DOCKER_BIN="$BIN/docker" bash "$SUT" > "$OUT" 2>&1
rc=$?

fail=0
note() { printf '%s\n' "$1"; }
check() { # naam verwacht(0/1) werkelijk(0/1)
  if [ "$2" = "$3" ]; then note "  ok   $1"; else note "  FOUT $1 (verwacht=$2 werkelijk=$3)"; fail=1; fi
}

note "== exit-code =="
check "exit 0 (opruimer mag de run-status nooit maskeren)" 0 "$rc"

note "== gereapte containers =="
while IFS='|' read -r id name age src expect; do
  [ -z "${id:-}" ] && continue
  if grep -qx "REAPED $name" "$WORK/reaped.log"; then actual=1; else actual=0; fi
  case "$expect" in
    REAP)   check "$name wordt gereapt" 1 "$actual" ;;
    KEEP)   check "$name blijft staan (jonge vreemde run)" 0 "$actual" ;;
    IGNORE) check "$name wordt genegeerd (geen stage-mount)" 0 "$actual" ;;
  esac
done <<< "$FIXTURES"

note "== stage-mappen =="
while IFS='|' read -r id name age src expect; do
  [ -z "${id:-}" ] && continue
  case "$src" in "$ROOT"/*) ;; *) continue ;; esac
  if [ -e "$src/marker" ]; then present=1; else present=0; fi
  case "$expect" in
    REAP) check "stage van $name is gewist" 0 "$present" ;;
    KEEP) check "stage van $name blijft intact" 1 "$present" ;;
  esac
done <<< "$FIXTURES"

note "== report-modus verwijdert niets =="
: > "$WORK/reaped.log"
mkdir -p "$ROOT/999"; echo x > "$ROOT/999/marker"
MODE=report SELF=vino-build-999 MAX_AGE_MIN=40 ROOT="$ROOT" \
  DOCKER_BIN="$BIN/docker" bash "$SUT" > "$WORK/out-report.txt" 2>&1
if [ -s "$WORK/reaped.log" ]; then r=1; else r=0; fi
check "report roept geen docker rm aan" 0 "$r"
if [ -e "$ROOT/999/marker" ]; then p=1; else p=0; fi
check "report laat de stage-map staan" 1 "$p"

note "== bad input =="
MODE=zwiep ROOT="$ROOT" DOCKER_BIN="$BIN/docker" bash "$SUT" >/dev/null 2>&1
check "onbekende MODE geeft exit 2" 2 "$?"

echo
if [ "$fail" -eq 0 ]; then
  echo "ALLE CHECKS OK"
else
  echo "TEST GEFAALD — output van de reaper:"
  sed 's/^/    /' "$OUT"
fi
exit "$fail"
