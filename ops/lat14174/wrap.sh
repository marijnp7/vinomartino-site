#!/bin/sh
# LAT-14174 — entrypoint-wrapper voor paperclip-paperclip-1. Zet de LAT-12882-patch
# (geen agent-env in ACPX-sessierecords) terug in /app vóór de server start, want een
# recreate gooit /app terug naar het image. Start altijd door: beschikbaarheid gaat voor,
# een ontbrekende patch meldt zich luid in de containerlog en via de PAT-ratchet.
sh /opt/lat14174/reapply.sh || echo "lat14174: reapply exit $? - LAT-12882-patch NIET actief (LAT-14174)" >&2
exec "$@"
