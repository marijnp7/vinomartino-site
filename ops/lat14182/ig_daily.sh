#!/usr/bin/env bash
# LAT-14182 / LAT-14181 — dagelijkse IG-plaatsing (besluit Marijn 19-10, kaart 90739454).
# Hoogstens één post per run. Bron: vinomartino-site ops/lat14182/ig_daily.sh, geinstalleerd
# door .github/workflows/lat14182-ig-daily.yml (mode install). Niet op de host editen.
#
#   ig_daily.sh [--dry-run [--post N]]
#     --dry-run   containers aanmaken en valideren (tags, collaborators), NIET publiceren (LAT-14288)
#     --post N    alleen met --dry-run: valideer queue-record N direct, buiten de selector om
# Queue-record: "user_tags" per slide, lijst in slidevolgorde [[{username,x,y}], [], ...] of
# {"<slide>": [...]}; "collaborators" + "collab_akkoord" zoals ig_publish.py ze kent.
# Exit: 0 geplaatst of niets te doen (selector exit 3), 4 tag/collab afgewezen (niet geplaatst), anders fout.
set -euo pipefail
DRY=""; POST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY="--dry-run" ;;
    --post) POST="${2:-}"; shift ;;
    *) echo "onbekend argument: $1" >&2; exit 1 ;;
  esac; shift
done
if [ -n "$POST" ]; then
  [[ "$POST" =~ ^[0-9]{1,4}$ ]] || { echo "--post N: N moet een getal zijn" >&2; exit 1; }
  [ -n "$DRY" ] || { echo "--post mag alleen samen met --dry-run" >&2; exit 1; }
fi
export IG_ROOT=/var/lib/docker/volumes/paperclip_home/_data
SOC="$IG_ROOT/design/vinomartino/social"
NEXT="$SOC/ig_next.py"
PUB=/opt/paperclip-social/bin/ig_publish.py
VAL=/opt/paperclip-social/bin/ig_validate.py
WEB="${IG_WEB_DIR:-__WEB_DIR__}"            # host-dir achter https://vinomartino.com/images/social/
BASE_URL=https://vinomartino.com/images/social
STATE="${IG_STATE_FILE:-/var/lib/paperclip/ig_published.json}"
set -a; . /root/.agent-secrets/instagram.env; set +a
W=$(mktemp -d /tmp/ig_daily.XXXXXX); trap 'rm -rf "$W"' EXIT
log() { echo "[ig_daily $(date -Is)] $*"; }

exec 9>/var/lock/ig_daily.lock; flock -n 9 || { log "andere run bezig, stop"; exit 0; }

# 1. live profiel (REGEL 34) -> live.json (lijst, nieuwste eerst)
curl -sf --get "https://graph.facebook.com/v21.0/$IG_USER_ID/media" \
  --data-urlencode "fields=id,caption,permalink,timestamp" --data-urlencode "limit=10" \
  --data-urlencode "access_token=$IG_ACCESS_TOKEN" -o "$W/media.json" \
  || { log "FOUT: GET /$IG_USER_ID/media mislukt"; exit 2; }
python3 -c 'import json,sys; json.dump(json.load(open(sys.argv[1]))["data"], open(sys.argv[2],"w"))' "$W/media.json" "$W/live.json"

# 2. selector (of met --post: het queue-record zelf, zonder rotatie/vrijgave-check: alleen dry-run)
if [ -n "$POST" ]; then
  set +e; python3 - "$SOC/ig_queue.json" "$POST" "$IG_ROOT" > "$W/job.json" 2> "$W/pick.err" <<'PY'
import json, re, sys
q, n, root = sys.argv[1], int(sys.argv[2]), sys.argv[3]
p = next((x for x in json.load(open(q))["posts"] if x.get("n") == n), None)
if not p: sys.exit(f"post {n} staat niet in ig_queue.json")
imgs = [re.sub(r"^/paperclip/", root + "/", i) for i in (p.get("images") or [])]
print(json.dumps({"n": n, "caption": p.get("caption") or "", "images": imgs,
                  "collaborators": p.get("collaborators") or [], "collab_akkoord": p.get("collab_akkoord"),
                  "user_tags": p.get("user_tags")}, ensure_ascii=False))
PY
  rc=$?; set -e
else
  set +e; python3 "$NEXT" --pick --live "$W/live.json" $DRY > "$W/job.json" 2> "$W/pick.err"; rc=$?; set -e
fi
cat "$W/pick.err" >&2
if [ $rc -eq 3 ]; then log "selector exit 3: vandaag niets plaatsen"; exit 0; fi
[ $rc -eq 0 ] || { log "FOUT: ig_next.py --pick exit $rc"; exit 1; }
N=$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1]))["n"]))' "$W/job.json")
log "gekozen: post $N"

# 3. beelden publiek zetten (Graph API wil https image_url's)
mkdir -p "$WEB/post-$N"
python3 - "$W/job.json" "$WEB/post-$N" "$BASE_URL/post-$N" "$W/pubjob.json" "$N" <<'PY'
import json, os, shutil, sys
job, dst, base, out, n = sys.argv[1:]
j = json.load(open(job)); urls = []
for i, src in enumerate(j["images"], 1):
    ext = os.path.splitext(src)[1].lower() or ".jpg"
    shutil.copyfile(src, os.path.join(dst, f"slide-{i}{ext}")); os.chmod(os.path.join(dst, f"slide-{i}{ext}"), 0o644)
    urls.append(f"{base}/slide-{i}{ext}")
p = {"caption": j["caption"], "idempotency_key": f"POST-{n}"}
if len(urls) == 1: p["image_url"] = urls[0]
else: p["children"] = urls
if j.get("collaborators"):
    p["collaborators"] = j["collaborators"]; p["collab_akkoord"] = j.get("collab_akkoord")
# LAT-14288: user_tags per slide -> slide_tags (carrousel) / user_tags (enkel beeld), ig_publish.py-formaat
ut = j.get("user_tags") or []
per = {int(k): v for k, v in ut.items()} if isinstance(ut, dict) else {i: v for i, v in enumerate(ut, 1)}
per = {i: [{"username": str(t["username"]).lstrip("@"), "x": t["x"], "y": t["y"]} for t in v] for i, v in per.items() if v}
bad = [i for i in per if not 1 <= i <= len(urls)]
if bad: sys.exit(f"user_tags voor slide(s) {bad}, post heeft {len(urls)} beelden")
if per and len(urls) == 1: p["user_tags"] = per[1]
elif per: p["slide_tags"] = [{"slide": i, "tags": per[i]} for i in sorted(per)]
json.dump(p, open(out, "w"), ensure_ascii=False)
print("\n".join(urls))
PY
chmod 755 "$WEB/post-$N"
for u in $(python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); print(" ".join(j.get("children") or [j["image_url"]]))' "$W/pubjob.json"); do
  c=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$u"); log "probe $u -> $c"
  case "$c" in "200 image/"*) ;; *) log "FOUT: beeld niet publiek"; exit 1;; esac
done

# 4. valideren: ig_publish-regels (o.a. collab_akkoord) en echte containers zonder publish (LAT-14288)
set +e; python3 "$PUB" --job "$W/pubjob.json" --dry-run; rc=$?; set -e
[ $rc -eq 0 ] || [ $rc -eq 3 ] || { log "FOUT: ig_publish.py --dry-run exit $rc, post $N niet geplaatst"; exit $rc; }
set +e; python3 "$VAL" --job "$W/pubjob.json"; rc=$?; set -e
if [ $rc -ne 0 ]; then
  log "FOUT: post $N niet geplaatst: containercheck exit $rc (afgewezen handle/tag/collab: zie FOUT-regels hierboven)"
  exit $rc
fi
[ -n "$DRY" ] && { log "dry-run klaar: post $N geaccepteerd door de Graph API, niet gepubliceerd"; exit 0; }

# 5. publiceren
set +e; python3 "$PUB" --job "$W/pubjob.json"; rc=$?; set -e
[ $rc -eq 0 ] || [ $rc -eq 3 ] || { log "FOUT: ig_publish.py exit $rc"; exit $rc; }
read -r PERMA MID < <(python3 -c 'import json,sys; s=json.load(open(sys.argv[1]))[sys.argv[2]]; print(s["permalink"], s["media_id"])' "$STATE" "POST-$N")
log "live: post $N $PERMA media $MID"

# 6. terugschrijven + eigenaar
python3 "$NEXT" --mark-posted "$N" --permalink "$PERMA" --media-id "$MID"
chown 1000:1000 "$SOC"/ig_queue.json* 
log "OK post $N $PERMA ($(stat -c '%u:%g' "$SOC/ig_queue.json"))"
