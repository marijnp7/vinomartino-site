#!/usr/bin/env python3
"""LAT-14288 — Instagram-containers aanmaken zonder te publiceren.

Bron: vinomartino-site ops/lat14182/ig_validate.py, geinstalleerd door
.github/workflows/lat14182-ig-daily.yml (mode install) naast ig_daily.sh. Niet op de host editen.

    ig_validate.py --job pubjob.json
        Maakt de child-containers (met user_tags per slide) en de parent-container (met
        collaborators) aan precies zoals ig_publish.py dat doet, en roept media_publish NOOIT aan.
        Een container die niet gepubliceerd wordt verloopt na 24 uur; er gaat geen uitnodiging of
        tag-melding uit. Per afgewezen slide/handle volgt een regel "FOUT: ...".

    ig_validate.py --probe-collab-max IMAGE_URL HANDLE [HANDLE ...]
        Meet hoeveel collaborators de Graph API op één container accepteert (k = 1..n).

Env: IG_USER_ID, IG_ACCESS_TOKEN (uit /root/.agent-secrets/instagram.env).
Exit: 0 alles geaccepteerd, 4 tag/collab/container afgewezen, 1 job ongeldig, 2 API onbereikbaar.
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

GRAPH = "https://graph.facebook.com/v21.0"
TOKEN = os.environ.get("IG_ACCESS_TOKEN", "")
IG = os.environ.get("IG_USER_ID", "")


def log(msg):
    print(f"[ig_validate] {msg}", flush=True)


def red(s):
    s = s.replace(TOKEN, "<redacted>") if TOKEN else s
    return re.sub(r"(EAA|IGQ|IGAA)[A-Za-z0-9_-]{20,}", "<redacted>", s)


def call(path, params, method="GET"):
    """(ok, json). Een Graph-fout is ok=False met de error-dict; netwerkfout -> exit 2."""
    params = dict(params, access_token=TOKEN)
    data = urllib.parse.urlencode(params).encode()
    url = f"{GRAPH}/{path}"
    req = urllib.request.Request(url + ("?" + data.decode() if method == "GET" else ""),
                                 data=None if method == "GET" else data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return True, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return False, json.load(e).get("error", {})
        except Exception:
            return False, {"message": f"HTTP {e.code}"}
    except Exception as e:
        log(f"FOUT: Graph API onbereikbaar ({type(e).__name__})")
        sys.exit(2)


def errtext(err):
    parts = [err.get("error_user_title"), err.get("error_user_msg") or err.get("message")]
    code = f"code {err.get('code')}" + (f"/{err.get('error_subcode')}" if err.get("error_subcode") else "")
    return red(" | ".join(p for p in parts if p) + f" ({code})")


def wait(cid, max_wait=90):
    """Wacht tot een container FINISHED is; geeft (status_code, status) terug."""
    t0 = time.time()
    while True:
        ok, j = call(cid, {"fields": "status_code,status"})
        sc = j.get("status_code") if ok else "ERROR"
        if sc in ("FINISHED", "ERROR", "EXPIRED", "PUBLISHED") or time.time() - t0 > max_wait:
            return sc, (j.get("status") if ok else errtext(j))
        time.sleep(3)


def discover(handle):
    """Informatief: business_discovery vindt alleen openbare business/creator-accounts."""
    ok, j = call(IG, {"fields": f"business_discovery.username({handle}){{username,followers_count}}"})
    return ok and (j.get("business_discovery") or {}).get("username", "").lower() == handle.lower()


def tags_for(job, slide):
    """Tags voor slide (1-based) uit slide_tags (carrousel) of user_tags (enkel beeld)."""
    if job.get("children"):
        return next((s.get("tags") or [] for s in job.get("slide_tags") or [] if int(s.get("slide", 0)) == slide), [])
    return job.get("user_tags") or []


def check_tags(tags, label):
    for t in tags:
        u, x, y = t.get("username"), t.get("x"), t.get("y")
        if not u or not isinstance(x, (int, float)) or not isinstance(y, (int, float)) or not (0 <= x <= 1 and 0 <= y <= 1):
            log(f"FOUT: {label}: ongeldige tag {json.dumps(t, ensure_ascii=False)} (username, x en y 0.0-1.0 verplicht)")
            sys.exit(1)
    if len(tags) > 20:
        log(f"FOUT: {label}: {len(tags)} tags, Instagram staat er 20 per beeld toe")
        sys.exit(1)


def validate(job):
    kids = job.get("children") or []
    urls = kids or [job["image_url"]]
    collabs = job.get("collaborators") or []
    handles = sorted({t["username"] for i in range(1, len(urls) + 1) for t in tags_for(job, i)} | set(collabs))
    for i in range(1, len(urls) + 1):
        check_tags(tags_for(job, i), f"slide {i}")
    found = {h: discover(h) for h in handles}
    for h in handles:
        log(f"handle @{h}: " + ("openbaar business/creator-account" if found[h] else
            "NIET gevonden via business_discovery (privé, persoonlijk, hernoemd of onbekend)"))
    fouten = 0
    caption = job.get("caption", "")
    if kids:
        ids = []
        for i, u in enumerate(kids, 1):
            tags = tags_for(job, i)
            p = {"image_url": u, "is_carousel_item": "true"}
            if tags:
                p["user_tags"] = json.dumps(tags)
            ok, j = call(f"{IG}/media", p, "POST")
            who = ", ".join("@" + t["username"] for t in tags) or "geen tags"
            if not ok:
                fouten += 1
                verdacht = [("@" + t["username"]) for t in tags if not found.get(t["username"])]
                log(f"FOUT: slide {i} afgewezen ({who}): {errtext(j)}"
                    + (f" -> verdacht: {', '.join(verdacht)}" if verdacht else ""))
                continue
            sc, st = wait(j["id"])
            if sc != "FINISHED":
                fouten += 1
                log(f"FOUT: slide {i} container {sc} ({who}): {red(str(st))}")
                continue
            log(f"slide {i} ok ({who})")
            ids.append(j["id"])
        if fouten:
            return fouten
        p = {"media_type": "CAROUSEL", "children": ",".join(ids), "caption": caption}
    else:
        p = {"image_url": urls[0], "caption": caption}
        if tags_for(job, 1):
            p["user_tags"] = json.dumps(tags_for(job, 1))
    if collabs:
        p["collaborators"] = json.dumps(collabs)
    ok, j = call(f"{IG}/media", p, "POST")
    soort = "carrousel" if kids else "enkel beeld"
    cl = ", ".join("@" + c for c in collabs) or "geen collaborators"
    if not ok:
        verdacht = [("@" + h) for h in collabs if not found.get(h)]
        log(f"FOUT: parent-container ({soort}, {cl}) afgewezen: {errtext(j)}"
            + (f" -> verdacht: {', '.join(verdacht)}" if verdacht else ""))
        return 1
    sc, st = wait(j["id"])
    if sc != "FINISHED":
        log(f"FOUT: parent-container {sc} ({cl}): {red(str(st))}")
        return 1
    log(f"OK: {soort} met {len(urls)} beeld(en), {sum(len(tags_for(job, i)) for i in range(1, len(urls) + 1))} tags, "
        f"{cl}; container {j['id']} NIET gepubliceerd (verloopt na 24 uur)")
    return 0


def probe(image_url, handles):
    log(f"probe collaborators-maximum op één container, k = 1..{len(handles)} (niets gepubliceerd)")
    for k in range(1, len(handles) + 1):
        ok, j = call(f"{IG}/media", {"image_url": image_url, "caption": "LAT-14288 probe, niet publiceren",
                                     "collaborators": json.dumps(handles[:k])}, "POST")
        log(f"k={k} -> " + (f"GEACCEPTEERD container {j.get('id')}" if ok else f"AFGEWEZEN: {errtext(j)}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job")
    ap.add_argument("--probe-collab-max", nargs="+", metavar="ARG")
    a = ap.parse_args()
    if not (TOKEN and IG):
        log("FOUT: IG_USER_ID/IG_ACCESS_TOKEN ontbreken"); sys.exit(1)
    if a.probe_collab_max:
        if len(a.probe_collab_max) < 2:
            ap.error("--probe-collab-max IMAGE_URL HANDLE [HANDLE ...]")
        probe(a.probe_collab_max[0], a.probe_collab_max[1:]); return
    if not a.job:
        ap.error("--job of --probe-collab-max")
    sys.exit(4 if validate(json.load(open(a.job))) else 0)


if __name__ == "__main__":
    main()
