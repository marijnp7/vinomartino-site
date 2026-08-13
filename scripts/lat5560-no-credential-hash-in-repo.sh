#!/usr/bin/env bash
#
# LAT-5560 — guard: er mag geen crypt(3)-wachtwoordhash in de repo staan.
#
# Aanleiding. `htpasswd` (de $apr1$-hash van vinomartino.com/intern/) stond op
# rootniveau in deze repo en werd bij elke deploy naar de VPS gekopieerd. Daardoor:
# de hash zit permanent in de git-historie en in elke clone, en elke rotatie moest
# hem opnieuw committen — de rotatie loste de blootstelling dus nooit op. Het bestand
# is verwijderd en de host is nu de bron van waarheid (deploy.yml stap 7). Zonder
# deze guard sluipt hij er terug in zonder dat iemand het ziet.
#
# WAAR DE GUARD OP SLUIT. Niet op de bestandsnaam `htpasswd` — die is te makkelijk te
# omzeilen door hem `auth.conf` te noemen. De invariant is de VORM van een crypt-hash in
# een getrackt bestand: een dubbele punt gevolgd door DOLLAR-apr1-DOLLAR (of 2y/2a/2b voor
# bcrypt, 5/6 voor SHA, 1 voor MD5). De bestandsnaam wordt er als tweede, bredere regel
# bij gecontroleerd.
#
# ZELF-MATCH — en waarom deze tekst zo omslachtig is. Een detector die zijn eigen patroon
# als literal bevat, vindt zichzelf en staat dan permanent rood; zichzelf uitsluiten maakt
# er een blinde vlek van. Het patroon wordt daarom uit losse stukken OPGEBOUWD.
#
# Dat gold aanvankelijk alleen voor de CODE: twee commentaarregels bevatten de vorm nog wel
# letterlijk, precies onder een regel die beweerde dat dat niet zo was. De guard vond dat
# op zijn eerste echte run — op zichzelf. Vandaar dat er hieronder nergens, ook niet in
# commentaar, een dubbele punt direct voor een dollarteken staat. Er is dus geen
# uitsluitingsregel nodig en geen enkel pad is blind.
#
# Gebruik:
#   scripts/lat5560-no-credential-hash-in-repo.sh            # scan getrackte bestanden
#   scripts/lat5560-no-credential-hash-in-repo.sh --self-test # rode tegenproef
#
# Exit 0 = schoon, 1 = hash gevonden.

set -euo pipefail

D='$'
# Opgebouwd uit losse stukken; zie de ZELF-MATCH-noot hierboven.
#
# RE_D, niet D: in ERE is een kale `$` een anker (einde-regel), ook midden in het
# patroon zodra er `(` of `|` op volgt. Ongeescaped matchte dit patroon daardoor
# NIETS en stond de guard permanent groen. Gevonden door --self-test; dat is precies
# waarvoor die stap bestaat.
RE_D='\$'
HASH_RE=":${RE_D}(apr1|1|5|6|2[aby])${RE_D}"
# Bestandsnamen die per definitie een credential dragen.
NAME_RE='(^|/)\.?ht(passwd|digest)$'

fail=0

scan_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  # Binaire bestanden overslaan: grep -I doet dat zelf, maar dan wel expliciet.
  if grep -IEqs -- "$HASH_RE" "$f"; then
    # Nooit de hash zelf printen — alleen waar hij staat (LAT-3641/LAT-3644).
    local n
    n=$(grep -IEc -- "$HASH_RE" "$f" || true)
    echo "::error file=${f}::LAT-5560: ${n} regel(s) met een crypt-wachtwoordhash. Credentials horen op de host, niet in de repo."
    fail=1
  fi
  if printf '%s' "$f" | grep -Eq -- "$NAME_RE"; then
    echo "::error file=${f}::LAT-5560: htpasswd-bestand in de repo. De host is de bron van waarheid (deploy.yml stap 7)."
    fail=1
  fi
}

self_test() {
  # Rode tegenproef: de guard moet op een geplante hash daadwerkelijk rood gaan.
  # Zonder deze stap bewijst een groene run alleen dat het script draaide.
  local tmp
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/lat5560-selftest-XXXXXX")
  trap 'rm -rf "$tmp"' RETURN

  # Canary 1: hash-vorm in een onschuldig genoemd bestand.
  printf 'marijn:%sapr1%sSALTSALT%s0123456789012345678901\n' "$D" "$D" "$D" > "$tmp/auth.conf"
  # Canary 2: bestandsnaam.
  printf 'niets bijzonders\n' > "$tmp/htpasswd"
  # Controle: een gewoon bestand mag NIET matchen, anders meet de guard niets.
  printf 'export PATH=%s{PATH}:/usr/local/bin\n' "$D" > "$tmp/schoon.sh"

  local rc=0
  for c in auth.conf htpasswd; do
    fail=0
    scan_file "$tmp/$c" >/dev/null 2>&1
    if [ "$fail" = "1" ]; then
      echo "  zelftest ROOD op $c: goed"
    else
      echo "::error::zelftest: $c werd NIET gedetecteerd — de guard meet niets"
      rc=1
    fi
  done

  fail=0
  scan_file "$tmp/schoon.sh" >/dev/null 2>&1
  if [ "$fail" = "0" ]; then
    echo "  zelftest GROEN op schoon.sh: goed"
  else
    echo "::error::zelftest: schoon.sh gaf een vals alarm — de guard is te breed"
    rc=1
  fi

  # De guard mag zichzelf niet vinden. Dit stond eerder alleen impliciet in de echte
  # scan, en dat is te laat: hij ging pas rood in CI, niet hier. Nu is het een expliciete
  # bewering, zodat een teruggeslopen literal meteen bij de zelftest opvalt.
  fail=0
  scan_file "$0" >/dev/null 2>&1
  if [ "$fail" = "0" ]; then
    echo "  zelftest GROEN op de guard zelf: goed"
  else
    echo "::error::zelftest: de guard matcht ZICHZELF — er staat een patroon-literal in dit bestand"
    rc=1
  fi

  fail=0
  return $rc
}

if [ "${1:-}" = "--self-test" ]; then
  echo "=== LAT-5560 guard: rode tegenproef ==="
  self_test
  echo "ZELFTEST_OK"
  exit 0
fi

echo "=== LAT-5560 guard: crypt-hash in getrackte bestanden ==="
while IFS= read -r -d '' f; do
  scan_file "$f"
done < <(git ls-files -z)

if [ "$fail" = "1" ]; then
  echo "GUARD_ROOD"
  exit 1
fi
echo "geen credential-hash gevonden in $(git ls-files | wc -l) getrackte bestanden"
echo "GUARD_GROEN"
