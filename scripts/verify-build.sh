#!/usr/bin/env bash
# LAT-1014 — dist-completeness gate
#
# Runs after `astro build`, before rsync to DIST. Hard-fails the deploy if the
# generated `dist/` looks incomplete. Catches the LAT-1011 failure mode where
# Astro exited 0 even though `getStaticPaths` errored out, leaving prod with
# only 404.html + a handful of SSR stubs.
#
# Usage: scripts/verify-build.sh [dist-dir]   (default: ./dist)

set -euo pipefail

DIST="${1:-dist}"

if [ ! -d "$DIST" ]; then
  echo "::error::verify-build: '$DIST' bestaat niet of is geen directory"
  exit 1
fi

REQUIRED=(
  "index.html"
  "404.html"
  "build-info.json"
  "artikelen/index.html"
  "landen/index.html"
  "streken/index.html"
  "wijnhuizen/index.html"
  "wijnroutes/index.html"
)

missing=0
for rel in "${REQUIRED[@]}"; do
  if [ ! -f "$DIST/$rel" ]; then
    echo "::error::verify-build: verplicht bestand ontbreekt: $DIST/$rel"
    missing=$((missing + 1))
  fi
done
if [ "$missing" -gt 0 ]; then
  echo "::error::verify-build: $missing verplichte bestanden ontbreken — build is incompleet"
  exit 1
fi

# Healthy build sits ~38 HTML pages. Drempel laag zetten zodat een
# bewust-leeg-getrokken streken-collectie nog door kan, maar een totale
# getStaticPaths-fail (=alleen statische + 404) hard faalt.
THRESHOLD="${VERIFY_BUILD_MIN_HTML:-30}"
html_count=$(find "$DIST" -type f -name '*.html' | wc -l)
if [ "$html_count" -lt "$THRESHOLD" ]; then
  echo "::error::verify-build: $html_count HTML-pagina's in $DIST (drempel: $THRESHOLD)"
  find "$DIST" -type f -name '*.html' | sort | sed 's/^/  /'
  exit 1
fi

# Astro's default 404-stub is ~4 KB. Een echte homepage is >10 KB. Als de
# build silently faalde en dist/index.html een fallback-stub is, vangen we
# dat hier.
INDEX_MIN_BYTES="${VERIFY_BUILD_MIN_INDEX_BYTES:-10240}"
index_bytes=$(wc -c < "$DIST/index.html" | tr -d ' ')
if [ "$index_bytes" -lt "$INDEX_MIN_BYTES" ]; then
  echo "::error::verify-build: dist/index.html is $index_bytes bytes (drempel: $INDEX_MIN_BYTES) — waarschijnlijk een SSR-stub"
  exit 1
fi

echo "::notice::verify-build OK — $html_count HTML-pagina's, index.html ${index_bytes} bytes"
