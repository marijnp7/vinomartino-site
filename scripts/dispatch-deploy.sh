#!/usr/bin/env bash
# LAT-3294 — veilige wrapper rond `gh workflow run deploy.yml`
#
# Waarom dit bestaat
# -----------------
# `deploy.yml` bepaalt zijn doel zo:
#
#     if   event == workflow_dispatch → target = inputs.target   (default: preview)
#     elif ref   == refs/heads/main   → target = production
#
# De `elif` is onbereikbaar voor een dispatch. Een
#
#     gh workflow run deploy.yml --ref main
#
# zonder expliciete `-f target=...` deployt daarom naar **preview**, sluit
# **groen** af, en laat productie onaangeroerd. Zo stond een contentwijziging
# ruim een uur "gedeployed" zonder dat prod ooit bewoog (run 30700769553).
#
# De structurele fix hoort in `deploy.yml` zelf te zitten. Die file is voor
# de agent-tokens niet schrijfbaar (403 op `.github/workflows/*`), dus tot
# die YAML-wijziging geland is, is dit script de gate: het geeft `-f target`
# ALTIJD expliciet mee en weigert de combinatie die stil misgaat.
#
# Gebruik:
#   scripts/dispatch-deploy.sh                  # main → production
#   scripts/dispatch-deploy.sh main production
#   scripts/dispatch-deploy.sh preview
#   scripts/dispatch-deploy.sh main preview     # → hard fail, met uitleg
#
# Env: REPO (default marijnp7/vinomartino-site), DRY_RUN=1 om alleen te tonen
#      welke dispatch zou draaien.

set -euo pipefail

REPO="${REPO:-marijnp7/vinomartino-site}"
REF="${1:-main}"
TARGET="${2:-}"

# Branch → het doel dat daar bij hoort. Dit is de enige plek waar die
# koppeling staat; hem hier expliciet maken is precies wat deploy.yml bij
# een dispatch nalaat.
case "$REF" in
  main)    expected="production" ;;
  preview) expected="preview" ;;
  *)
    echo "dispatch-deploy: '$REF' is geen deploybare branch (alleen main of preview)." >&2
    exit 2
    ;;
esac

if [ -z "$TARGET" ]; then
  TARGET="$expected"
  echo "dispatch-deploy: geen target opgegeven → '$TARGET' (afgeleid uit ref '$REF')."
fi

if [ "$TARGET" != "$expected" ]; then
  echo "dispatch-deploy: WEIGERD — ref '$REF' met target '$TARGET'." >&2
  echo >&2
  if [ "$REF" = "main" ] && [ "$TARGET" = "preview" ]; then
    echo "  Dit is precies de combinatie uit LAT-3294: de run loopt GROEN af," >&2
    echo "  meldt '##[notice]Deploying to preview', en productie beweegt niet." >&2
    echo "  Wil je preview deployen? Dispatch dan vanaf de preview-branch:" >&2
    echo "      scripts/dispatch-deploy.sh preview" >&2
  else
    echo "  Branch '$REF' hoort bij target '$expected'." >&2
  fi
  exit 1
fi

echo "dispatch-deploy: $REPO — ref=$REF target=$TARGET"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 — zou draaien: gh workflow run deploy.yml --repo $REPO --ref $REF -f target=$TARGET"
  exit 0
fi

gh workflow run deploy.yml --repo "$REPO" --ref "$REF" -f target="$TARGET"

# `gh workflow run` geeft geen run-id terug. Even wachten en dan de nieuwste
# run van deze workflow tonen, zodat de aanroeper meteen kan meekijken in
# plaats van zelf te moeten zoeken.
sleep 5
gh run list --repo "$REPO" --workflow deploy.yml --limit 1 \
  --json databaseId,displayTitle,status,url \
  --jq '.[0] | "run \(.databaseId): \(.displayTitle) [\(.status)]\n\(.url)"' || true
