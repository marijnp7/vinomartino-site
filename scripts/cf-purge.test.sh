#!/usr/bin/env bash
# LAT-3213 — tests voor scripts/cf-purge.sh.
#
# Draait lokaal, zonder netwerk: `curl` wordt vervangen door een stub op PATH
# die teruggeeft wat de test wil. Elke assertie test zowel de exit-code als de
# annotatie, want "exit 0" alleen bewijst niet dat er gewaarschuwd is — en een
# purge die stilletjes niets doet is precies de faalmodus die we niet willen.
#
# Usage: bash scripts/cf-purge.test.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$HERE/cf-purge.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cf-purge-test-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# Zet een curl-stub neer die $1 naar stdout schrijft en met $2 exit.
stub_curl() {
  mkdir -p "$WORK/bin"
  cat > "$WORK/bin/curl" <<EOF
#!/usr/bin/env bash
printf '%s' '$1'
exit ${2:-0}
EOF
  chmod +x "$WORK/bin/curl"
}

# env_file <naam> <inhoud> — elke fixture krijgt een eigen bestand, anders
# overschrijft een latere fixture er stilletjes een eerdere en slaagt een test
# op het verkeerde codepad.
env_file() {
  printf '%s\n' "$2" > "$WORK/$1.env"
  echo "$WORK/$1.env"
}

# check <naam> <verwachte-exit> <verwacht-substring> -- <env-assignments...>
check() {
  local name="$1" want_code="$2" want_out="$3"; shift 4
  local out code
  out=$(env PATH="$WORK/bin:$PATH" "$@" bash "$SUT" 2>&1)
  code=$?
  if [ "$code" = "$want_code" ] && printf '%s' "$out" | grep -qF -- "$want_out"; then
    echo "ok   — $name"
    pass=$((pass + 1))
  else
    echo "FAIL — $name"
    echo "       verwacht: exit=$want_code met '$want_out'"
    echo "       kreeg:    exit=$code met: $out"
    fail=$((fail + 1))
  fi
}

GOOD_ENV="$(env_file good 'CF_API_TOKEN=tok
CF_ZONE_ID=zone123')"

# 1. Happy path.
stub_curl '{"success": true,"result":{"id":"x"}}'
check "geslaagde purge -> exit 0 + ::notice::" 0 "::notice::Cloudflare-cache gepurged voor zone zone123" -- \
  CF_ENV_FILE="$GOOD_ENV" CF_API_BASE=http://stub

# 2. Ontbrekende env-file is niet-fataal.
check "env-file ontbreekt -> exit 0 + ::warning::" 0 "::warning::CF-purge overgeslagen/mislukt" -- \
  CF_ENV_FILE="$WORK/bestaat-niet.env"

# 3. Dezelfde situatie in strict-modus MOET rood worden. Zonder deze omkering
#    bewijst test 2 alleen dat het script exit 0 kán geven, niet dat de
#    niet-fataal-schakelaar echt de exit-code stuurt.
check "env-file ontbreekt + strict -> exit 1 + ::error::" 1 "::error::CF-purge:" -- \
  CF_ENV_FILE="$WORK/bestaat-niet.env" CF_PURGE_STRICT=1

# 4. Lege/incomplete env-file.
INCOMPLETE_ENV="$(env_file incomplete 'CF_API_TOKEN=tok')"
check "CF_ZONE_ID ontbreekt -> exit 0 + reden genoemd" 0 "CF_ZONE_ID ontbreekt" -- \
  CF_ENV_FILE="$INCOMPLETE_ENV"

# 5. Verlopen token (CF-foutcode 10000) — dit is de LAT-3197-situatie van nu.
stub_curl '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}'
check "verlopen token -> exit 0 + verwijst naar LAT-3197" 0 "LAT-3197" -- \
  CF_ENV_FILE="$GOOD_ENV" CF_API_BASE=http://stub CF_PURGE_SLEEP=0

# 6. Verlopen token in strict-modus -> rood.
check "verlopen token + strict -> exit 1" 1 "::error::CF-purge:" -- \
  CF_ENV_FILE="$GOOD_ENV" CF_API_BASE=http://stub CF_PURGE_SLEEP=0 CF_PURGE_STRICT=1

# 7. Generieke fout: alle retries op, dan waarschuwen.
stub_curl '{"success":false,"errors":[{"code":1234,"message":"boom"}]}'
check "3x mislukt -> exit 0 + 'na 3 pogingen'" 0 "na 3 pogingen" -- \
  CF_ENV_FILE="$GOOD_ENV" CF_API_BASE=http://stub CF_PURGE_SLEEP=0

# 8. curl zelf crasht (exit != 0, geen JSON).
stub_curl 'curl: (28) Operation timed out' 28
check "curl-timeout -> exit 0 + waarschuwing" 0 "::warning::CF-purge overgeslagen/mislukt" -- \
  CF_ENV_FILE="$GOOD_ENV" CF_API_BASE=http://stub CF_PURGE_SLEEP=0

echo
echo "$pass geslaagd, $fail gefaald"
[ "$fail" -eq 0 ]
