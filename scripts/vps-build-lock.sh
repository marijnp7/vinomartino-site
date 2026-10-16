#!/usr/bin/env bash
# scripts/vps-build-lock.sh — serialiseer VPS-builds met een host-lock (LAT-4966)
#
# Wordt GESOURCED vanuit de build-stap van deploy.yml / i18n-nl-gate.yml /
# publish.yml, ná `cd "$STAGE"`:
#
#     if [ -f scripts/vps-build-lock.sh ]; then . scripts/vps-build-lock.sh; fi
#
# Sourcen (niet uitvoeren) is essentieel: de lock hangt aan file descriptor 9 van
# de aanroepende shell, en moet vastgehouden worden zolang `docker run` loopt. In
# een subshell zou hij meteen weer vrijgegeven worden.
#
# Waarom
# ------
# De VPS heeft `nproc=2` en draait daarnaast de hele paperclip-vloot, Directus en
# de prod-nginx. Twee gelijktijdige site-builds kosten daar SUPERLINEAIR — gemeten
# 2026-08-11:
#
#   solo build                                    ~415-423 s
#   deploy 31515069478  (17:02:48 → 17:22:12)      1164 s   \ vrijwel volledig
#   gate   31515283123  (17:00:39 → 17:21:14)      1235 s   / overlappend
#
# Elk ~2,9x de solo-tijd, niet 2x. Geserialiseerd is de tweede build dus eerder
# klaar dan gelijktijdig (415 + 415 = 830 s tegen 2x ~1200 s), en er blijft marge
# onder `timeout-minutes`. Bij drie gelijktijdige builds haalt géén van de drie
# de 30-minutencap meer; geserialiseerd halen de eerste twee hem ruim.
#
# Waarom niet via GHA-`concurrency:`
# ----------------------------------
# deploy.yml en publish.yml zitten in groep `vinomartino-write`, i18n-nl-gate.yml
# in `i18n-gate-pr-<nummer>`. Eén gedeelde groep lijkt de fix maar maakt het
# erger: GitHub houdt maximaal ÉÉN pending run per groep, dus een wachtende run
# wordt gecanceld zodra de volgende zich aandient. Zo stierf run 31515037133 op
# 2026-08-11 na 23 s zonder ooit een stap te draaien. Dat zou elke PR-gate die
# achter een deploy staat willekeurig rood/gecanceld maken. Een host-lock heeft
# dat probleem niet: de run blijft gewoon draaien en wacht.
#
# Best-effort, nooit een rode check
# ---------------------------------
# Loopt LOCK_WAIT_S af, dan bouwen we alsnog — gedegradeerd naar precies het
# gedrag van vandaag (gelijktijdig, langzamer, maar het haalde de cap). Deze lock
# mag nooit de oorzaak zijn van een gefaalde build; hij is een optimalisatie, geen
# poortwachter. Zelfde reden voor de `command -v flock` en de writability-test:
# ontbreekt een van beide, dan waarschuwen we en gaan door.
#
# Verhouding tot de reaper (LAT-4968)
# -----------------------------------
# Complementair, geen overlap. Haalt een job zijn `timeout-minutes`, dan sterft de
# ssh-sessie en geeft de kernel deze lock automatisch vrij — maar de container
# leeft door als wees, want die hangt aan de docker-daemon. Het opruimen daarvan
# is het werk van scripts/reap-build-containers.sh in de reaper-steps. Deze lock
# voorkomt de contentie; de reaper ruimt de gevolgen van een timeout op.
#
# LOCK_WAIT_S
# -----------
# 600 s. Ondergrens is de kleinste job-cap die dit pad gebruikt: publish.yml
# build-preview staat op `timeout-minutes: 20` (1200 s). Met een build van ~420 s
# past 600 s wachten + 420 s bouwen daar nog in. Bij de realistische wachtrij
# (één build vóór je) is de echte wachttijd ~420 s. Verlaag je ergens een
# `timeout-minutes`, kijk dan of deze waarde nog past.

# Deploy-voorrang (LAT-13549, 2026-10-15)
# ---------------------------------------
# De "na 600 s gelijktijdig verder"-regel hierboven ging uit van ~420 s per
# build. Sinds de streken/artikelen-assetfase duurt een solo-build ~40 min, en
# gelijktijdig bouwen kost dan de PRODUCTIE-deploy zijn job-cap: run 38660049747
# (#1398) wachtte 600 s op de i18n-gate van PR #573 (vino-gate-pr-38658720666),
# bouwde daarna gelijktijdig en werd op 45 min gecanceld; #1394 idem. Daarom
# nu twee rollen:
#
#   deploy     (LOCK_ROLE=deploy, of TARGET gezet — alleen deploy.yml geeft
#              TARGET mee aan deze shell). Wacht tot LOCK_WAIT_DEPLOY_S (2100 s
#              = gate-cap 30 min + marge) en zet zolang een wachtmarker. Krijgt
#              hij de lock niet, dan bouwt hij gedegradeerd verder: een deploy
#              wijkt nooit.
#   secundair  (gate, publish-preview). Wijkt voor een deploy: staat er een
#              verse wachtmarker, of krijgt hij de lock niet binnen LOCK_WAIT_S,
#              dan stopt hij met exit 75 in plaats van gelijktijdig te bouwen.
#              Dat is een bewust rode check ("VPS bezet, opnieuw draaien"), want
#              een gedegradeerde gate sloopt de deploy die erachter wacht.
#
# Een lopende gate wordt niet afgebroken: de deploy wacht tot hij klaar is
# (≤ 30 min) en bouwt dan solo. Dat vraagt een deploy-cap boven 35 + ~42 min;
# deploy.yml staat daarom op `timeout-minutes: 90`.

LOCK_FILE="${LOCK_FILE:-/srv/vino-builds/.build.lock}"
LOCK_ROLE="${LOCK_ROLE:-$([ -n "${TARGET:-}" ] && echo deploy || echo secondary)}"
LOCK_WAIT_S="${LOCK_WAIT_S:-600}"
LOCK_WAIT_DEPLOY_S="${LOCK_WAIT_DEPLOY_S:-2100}"
LOCK_MARKER="${LOCK_MARKER:-$LOCK_FILE.deploy-waiting}"
LOCK_MARKER_TTL_S="${LOCK_MARKER_TTL_S:-2400}"
LOCK_POLL_S="${LOCK_POLL_S:-15}"

__lock_marker_fresh() {
    [ -f "$LOCK_MARKER" ] || return 1
    local age=$(( $(date +%s) - $(stat -c %Y "$LOCK_MARKER" 2>/dev/null || echo 0) ))
    [ "$age" -lt "$LOCK_MARKER_TTL_S" ]
}

# Pas `exec 9>` uitvoeren als aantoonbaar is dat dat kan. Een mislukte
# exec-redirect is voor een non-interactieve shell fataal (special builtin), en
# dat zou deze optimalisatie de build laten slopen. De touch bewijst vooraf dat
# het pad schrijfbaar is.
if command -v flock >/dev/null 2>&1 &&
    mkdir -p "$(dirname "$LOCK_FILE")" 2>/dev/null &&
    touch "$LOCK_FILE" 2>/dev/null; then
    exec 9>"$LOCK_FILE"
    __lock_t0=$SECONDS
    if [ "$LOCK_ROLE" = deploy ]; then
        if flock -n 9; then
            echo "[build-lock] deploy: lock direct verkregen ($LOCK_FILE)"
        else
            echo "${RUN_ID:-?} $(date -u +%FT%TZ)" > "$LOCK_MARKER" 2>/dev/null || true
            echo "[build-lock] deploy: VPS bezet, wachtmarker gezet; wacht tot ${LOCK_WAIT_DEPLOY_S}s"
            if flock -w "$LOCK_WAIT_DEPLOY_S" 9; then
                echo "[build-lock] deploy: lock verkregen na $((SECONDS - __lock_t0))s"
            else
                echo "::warning::[build-lock] deploy: na ${LOCK_WAIT_DEPLOY_S}s geen lock — ik bouw gedegradeerd verder (LAT-13549)"
            fi
            rm -f "$LOCK_MARKER" 2>/dev/null || true
        fi
    else
        __lock_got=0
        while :; do
            if __lock_marker_fresh; then
                echo "::error::[build-lock] een productie-deploy wacht op de VPS ($(cat "$LOCK_MARKER" 2>/dev/null)); deze build wijkt (exit 75). Draai hem opnieuw als de deploy klaar is (LAT-13549)"
                exit 75
            fi
            if flock -w "$LOCK_POLL_S" 9; then
                if __lock_marker_fresh; then flock -u 9; continue; fi
                __lock_got=1; break
            fi
            [ $((SECONDS - __lock_t0)) -ge "$LOCK_WAIT_S" ] && break
        done
        if [ "$__lock_got" = 1 ]; then
            echo "[build-lock] lock verkregen na $((SECONDS - __lock_t0))s ($LOCK_FILE)"
        else
            echo "::error::[build-lock] na ${LOCK_WAIT_S}s geen lock — er loopt een andere VPS-build. Deze build bouwt niet gelijktijdig (exit 75); draai hem opnieuw (LAT-13549)"
            exit 75
        fi
        unset __lock_got
    fi
    unset __lock_t0
else
    echo "::warning::[build-lock] geen lock beschikbaar (flock ontbreekt of $LOCK_FILE niet schrijfbaar) — builds serialiseren niet (LAT-4966)"
fi
