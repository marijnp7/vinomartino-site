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

LOCK_FILE="${LOCK_FILE:-/srv/vino-builds/.build.lock}"
LOCK_WAIT_S="${LOCK_WAIT_S:-600}"

# Pas `exec 9>` uitvoeren als aantoonbaar is dat dat kan. Een mislukte
# exec-redirect is voor een non-interactieve shell fataal (special builtin), en
# dat zou deze optimalisatie de build laten slopen — precies wat hierboven staat
# dat hij nooit mag doen. De touch bewijst vooraf dat het pad schrijfbaar is.
if command -v flock >/dev/null 2>&1 &&
    mkdir -p "$(dirname "$LOCK_FILE")" 2>/dev/null &&
    touch "$LOCK_FILE" 2>/dev/null; then
    exec 9>"$LOCK_FILE"
    __lock_t0=$SECONDS
    if flock -w "$LOCK_WAIT_S" 9; then
        echo "[build-lock] lock verkregen na $((SECONDS - __lock_t0))s ($LOCK_FILE)"
    else
        echo "::warning::[build-lock] na ${LOCK_WAIT_S}s geen lock gekregen — er loopt een andere VPS-build; ik bouw gelijktijdig verder (gedegradeerd, trager, zie LAT-4966)"
    fi
    unset __lock_t0
else
    echo "::warning::[build-lock] geen lock beschikbaar (flock ontbreekt of $LOCK_FILE niet schrijfbaar) — builds serialiseren niet (LAT-4966)"
fi
