#!/usr/bin/env bash
# scripts/vps-build-lock.test.sh — LAT-13549
#
# Sourcet scripts/vps-build-lock.sh zoals de build-stap dat doet, tegen een lock
# in een eigen mktemp-map, en controleert de deploy-voorrang:
#   - een secundaire build (gate/publish) bouwt NOOIT gelijktijdig: exit 75;
#   - een secundaire build wijkt voor een verse deploy-wachtmarker;
#   - een deploy wacht op de lock en ruimt zijn marker op;
#   - timeout of ontbrekende/onbruikbare lock start nooit de build.
# Falsifieerbaar: op de vorige PR-head falen scenario's 6–9; op de oude lock
# (na 600 s "gelijktijdig verder") falen ook scenario's 3 en 4.
#
#   bash scripts/vps-build-lock.test.sh

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUT="${SUT:-$HERE/vps-build-lock.sh}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/lat13549-lock-test.XXXXXXXX")"
LOCK="$WORK/.build.lock"
trap 'kill $(jobs -p) 2>/dev/null; rm -f "$LOCK" "$LOCK.deploy-waiting" "$WORK/blocker"; rmdir "$WORK/no-flock" "$WORK" 2>/dev/null || true' EXIT
command -v flock >/dev/null || { echo "SKIP: flock ontbreekt"; exit 0; }

fail=0
run() { # env-assignments... -- ; draait de build-stap, print output, zet RC
    OUT="$(env -u TARGET LOCK_FILE="$LOCK" LOCK_POLL_S=1 "$@" /bin/bash -c '. "$0"; echo BUILT' "$SUT" 2>&1)"; RC=$?
}
hold() { flock "$LOCK" sleep "$1" & HOLDER_PID=$!; sleep 0.3; }
check() { # naam, conditie
    if eval "$2"; then echo "ok   $1"; else echo "FAIL $1 (rc=$RC)"; echo "$OUT" | sed 's/^/     | /'; fail=1; fi
}

run LOCK_ROLE=deploy
check "1 deploy, vrije lock: direct bouwen" '[ $RC = 0 ] && grep -q BUILT <<<"$OUT"'

hold 2; run LOCK_ROLE=deploy LOCK_WAIT_DEPLOY_S=10
check "2 deploy wacht op lopende build en bouwt daarna solo" '[ $RC = 0 ] && grep -q "lock verkregen na" <<<"$OUT" && [ ! -e "$LOCK.deploy-waiting" ]'
wait

hold 4; run LOCK_ROLE=secondary LOCK_WAIT_S=2
check "3 secundair, lock bezet: exit 75, niet gelijktijdig" '[ $RC = 75 ] && ! grep -q BUILT <<<"$OUT"'
wait

echo "x" > "$LOCK.deploy-waiting"; run LOCK_ROLE=secondary LOCK_WAIT_S=2
check "4 secundair wijkt voor verse deploy-marker" '[ $RC = 75 ] && ! grep -q BUILT <<<"$OUT"'

touch -d "-2 hours" "$LOCK.deploy-waiting"; run LOCK_ROLE=secondary LOCK_WAIT_S=2
check "5 verlopen marker blokkeert niet" '[ $RC = 0 ] && grep -q BUILT <<<"$OUT"'
rm -f "$LOCK.deploy-waiting"

hold 4; run LOCK_ROLE=deploy LOCK_WAIT_DEPLOY_S=1
check "6 deploy-timeout: geen build zolang lock bezet is" '[ $RC = 75 ] && ! grep -q BUILT <<<"$OUT" && kill -0 "$HOLDER_PID" 2>/dev/null && ! flock -n "$LOCK" true 2>/dev/null && [ ! -e "$LOCK.deploy-waiting" ]'
wait

hold 4; run TARGET=production LOCK_WAIT_DEPLOY_S=1
check "7 TARGET gezet (deploy.yml) => deploy-timeout stopt" '[ $RC = 75 ] && ! grep -q BUILT <<<"$OUT" && grep -q "deploy:" <<<"$OUT"'
wait

mkdir -p "$WORK/no-flock"
run LOCK_ROLE=deploy PATH="$WORK/no-flock"
check "8 flock ontbreekt: geen build" '[ $RC = 75 ] && ! grep -q BUILT <<<"$OUT"'

touch "$WORK/blocker"
run LOCK_ROLE=secondary LOCK_FILE="$WORK/blocker/.lock"
check "9 lockpad onbruikbaar: geen build" '[ $RC = 75 ] && ! grep -q BUILT <<<"$OUT"'

exit $fail
