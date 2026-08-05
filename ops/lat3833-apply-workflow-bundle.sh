#!/usr/bin/env bash
# LAT-3833 — pas de bundel toe zodra "Workflows: Read and write" op de PAT staat.
#
# Alles in deze bundel raakt uitsluitend .github/workflows/**. Dat is precies
# het pad waar de agent-tokens 403 op krijgen (gemeten 2026-08-05: PUT ops/ ->
# 201, PUT .github/workflows/ -> 403). De rest van LAT-3294 is al gemerged in
# PR #265 en zit NIET in deze patch.
#
# Gebruik (vanaf een schone checkout van main):
#   bash ops/lat3833-apply-workflow-bundle.sh
#
# Verwacht resultaat: branch fix/lat-3833-workflow-bundle met 1 commit,
# klaar om te pushen en te mergen.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PATCH="ops/lat3833-workflow-gate-bundle.patch"
BRANCH="fix/lat-3833-workflow-bundle"
BASE="d7c3e63e103aa71fb00e85fa3b40797e7a01741d"   # origin/main t.t.v. samenstellen

[ -f "$PATCH" ] || { echo "ontbreekt: $PATCH" >&2; exit 1; }

if ! git merge-base --is-ancestor "$BASE" HEAD 2>/dev/null; then
  echo "LET OP: $BASE zit niet in de historie van HEAD — patch kan verschoven zijn." >&2
fi

git checkout -B "$BRANCH"

if ! git apply --check "$PATCH"; then
  echo >&2
  echo "De patch past niet meer schoon. .github/workflows/ is sinds $BASE gewijzigd." >&2
  echo "Bekijk de conflicten met: git apply --3way $PATCH" >&2
  exit 1
fi

git apply "$PATCH"

# YAML moet parsen vóór de commit — een kapotte workflow is stil tot je hem draait.
if [ -d node_modules/js-yaml ]; then
  node -e '
    const yaml=require("js-yaml"), fs=require("fs");
    for (const f of fs.readdirSync(".github/workflows")) {
      yaml.load(fs.readFileSync(".github/workflows/"+f,"utf8"));
      console.log("parse OK: "+f);
    }'
else
  echo "js-yaml niet gevonden — sla YAML-parsecheck over (draai hem handmatig)." >&2
fi

git add .github/workflows/
git commit -F - <<'MSG'
fix(LAT-3769, LAT-3298, LAT-3294): SSH-keepalive + dispatch-target-guard

LAT-3769 — ServerAliveInterval 30 / ServerAliveCountMax 6 / TCPKeepAlive /
ConnectTimeout 20 / ConnectionAttempts 5 in alle 5 Configure-SSH heredocs
(deploy.yml, deploy-cos.yml, promote.yml, publish.yml x2), plus een
voortgangsregel elke 60 s in de promote-poll-loop van publish.yml. Een
volledig stille sessie werd na ~4,5 min ge-evict (run 30980347827); een
16 minuten pratende sessie overleefde.

LAT-3298 / LAT-3294 defect 1 — `default: preview` maakte de elif-tak
onbereikbaar, dus `gh workflow run --ref main` zonder expliciete
`-f target` deployde naar preview en liep tóch groen af (run 30700769553).
Nu: `auto` volgt de branch (main -> production), main+preview wordt hard
geweigerd tenzij force_preview_from_main=true, en `run-name` zet het
werkelijke doel in de RUNLIJST.

Truth-table (8 scenario's) en YAML-parse geverifieerd in LAT-3833.

Co-Authored-By: Paperclip <noreply@paperclip.ing>
MSG

echo
echo "Klaar. Nu:  git push -u origin $BRANCH  &&  gh pr create --base main"
