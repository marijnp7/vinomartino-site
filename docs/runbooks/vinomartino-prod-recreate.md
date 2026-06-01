# Runbook — Recreate `paperclip-vinomartino-prod-1`

Wanneer de productie-container drift heeft gekregen ten opzichte van
`docker-compose.vinomartino-prod.yml` (verkeerd image, ontbrekende
bind-mounts, ontbrekende traefik labels, etc.) en de pipeline drift-step
(`Verify prod container matches compose spec`) faalt op auto-reconcile,
gebruik dit runbook om handmatig te herstellen.

## Wanneer toepassen

- Pipeline-step `Verify prod container matches compose spec (LAT-914)`
  meldt `::error::Reconcile gefaald — drift na force-recreate`.
- Smoke-test (LAT-910 sha-aware) faalt met `::error::Productie serveert
  SHA 'X' maar workflow draait 'Y'` terwijl rsync naar `dist/` aantoonbaar
  geslaagd is.
- Site geeft 500/502/503 vanuit nginx en `docker logs paperclip-vinomartino-prod-1`
  toont mount-fouten of config-resolve fouten.
- Direct na een handmatige `docker run`/`docker build` interventie op de VPS
  (zoals het geval was tijdens [LAT-909](/LAT/issues/LAT-909) op 2026-05-06,
  toen iemand `paperclip-site-prod:new` lokaal bouwde en de container daarmee
  startte parallel aan het rsync+bind-mount-pad).

## Vooraf

- SSH-toegang tot de VPS als de gebruiker waar de site onder draait
  (`/root/vinomartino-site` is de project-root).
- `docker` CLI op de VPS, geen sudo nodig binnen de devops-workspace.
- Compose-file `/root/vinomartino-site/docker-compose.vinomartino-prod.yml`
  moet up-to-date zijn met repo-`main`. Pipeline-step 7 syncs deze; bij twijfel
  vergelijk met repo:

  ```bash
  diff -u \
    /root/vinomartino-site/docker-compose.vinomartino-prod.yml \
    <(curl -fsSL https://raw.githubusercontent.com/marijnp7/vinomartino-site/main/docker-compose.vinomartino-prod.yml)
  ```

## Stappen

### 1. Snapshot huidige (gebroken) container-spec

Bewaar de live spec voor rollback-bewijs en post-mortem.

```bash
TS=$(date +%s)
docker inspect paperclip-vinomartino-prod-1 > "/tmp/prod-rollback-${TS}.json"
echo "Snapshot: /tmp/prod-rollback-${TS}.json"
```

### 2. Zachte reconcile-poging (compose-driven)

In 95% van de gevallen is dit voldoende — `--force-recreate --no-deps` doet
exact wat we willen: stop + rm + create-met-spec + start, zonder andere
services aan te raken.

```bash
cd /root/vinomartino-site
docker compose -f docker-compose.vinomartino-prod.yml \
  up -d --force-recreate --no-deps vinomartino-prod
```

Sleep daarna ~5s en verifieer met stap 5. Als de container niet bestaat of
compose faalt op een conflict (bijvoorbeeld een vastzittende container met
hetzelfde `container_name`), ga door naar stap 3.

### 3. Handmatige stop + rm

```bash
docker stop paperclip-vinomartino-prod-1 || true
docker rm paperclip-vinomartino-prod-1 || true
```

### 4. Recreate via compose (na schone slate)

```bash
cd /root/vinomartino-site
docker compose -f docker-compose.vinomartino-prod.yml \
  up -d --no-deps vinomartino-prod
```

Als compose niet beschikbaar is of een onverwachte fout geeft, val terug op
de `docker create + start` flow uit het LAT-909 incident:

```bash
docker create \
  --name paperclip-vinomartino-prod-1 \
  --restart unless-stopped \
  --memory 128m \
  --network paperclip_default \
  -v /root/vinomartino-site/dist:/usr/share/nginx/html:ro \
  -v /root/vinomartino-site/nginx-prod.conf:/etc/nginx/conf.d/default.conf:ro \
  --label traefik.enable=true \
  --label traefik.http.routers.vinomartino.entrypoints=websecure \
  --label "traefik.http.routers.vinomartino.rule=Host(\`vinomartino.com\`) || Host(\`www.vinomartino.com\`)" \
  --label traefik.http.routers.vinomartino.tls.certresolver=letsencrypt \
  --label traefik.http.services.vinomartino.loadbalancer.server.port=80 \
  nginx:alpine

docker start paperclip-vinomartino-prod-1
```

Dit is exact het pad gebruikt tijdens [LAT-909](/LAT/issues/LAT-909) recovery
(zie comment c501ce3a voor de oorspronkelijke run).

### 5. Verificatie

#### 5a. Container-spec matcht compose

```bash
docker inspect paperclip-vinomartino-prod-1 \
  --format '{{.Config.Image}} | {{.HostConfig.RestartPolicy.Name}}'
# Verwacht: nginx:alpine | unless-stopped

docker inspect paperclip-vinomartino-prod-1 \
  --format '{{range .Mounts}}{{.Source}} → {{.Destination}} ({{if .RW}}rw{{else}}ro{{end}}){{"\n"}}{{end}}'
# Verwacht twee bind-mounts:
#   /root/vinomartino-site/dist → /usr/share/nginx/html (ro)
#   /root/vinomartino-site/nginx-prod.conf → /etc/nginx/conf.d/default.conf (ro)

docker inspect paperclip-vinomartino-prod-1 \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
# Verwacht: paperclip_default

docker inspect paperclip-vinomartino-prod-1 \
  --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' \
  | grep ^traefik | sort
# Verwacht 5 traefik.* labels
```

#### 5b. Site serveert juiste content (cache-busted)

```bash
RUN_ID=$(date +%s)
curl -fsS "https://vinomartino.com/build-info.json?cb=${RUN_ID}" \
  -H 'Cache-Control: no-cache'
# Verwacht JSON met sha == HEAD van main op github.com/marijnp7/vinomartino-site

curl -sSI "https://vinomartino.com/?cb=${RUN_ID}" \
  -H 'Cache-Control: no-cache' \
  | grep -i 'last-modified\|cf-cache-status\|x-cache-status'
# Verwacht: last-modified ≈ tijdstip van laatste rsync naar dist/
```

#### 5c. Smoke-test paden

```bash
for url in \
  https://vinomartino.com/wijnhuizen/bartolo-mascarello-barolo/ \
  https://vinomartino.com/wijnroutes/ \
  https://vinomartino.com/streken/douro-portugal/ \
  https://vinomartino.com/artikelen/ ; do
  echo -n "$url → "
  curl -o /dev/null -s -w "%{http_code}\n" "$url?cb=$(date +%s)"
done
# Allemaal 200
```

### 6. Trigger nieuwe deploy om pipeline-confidence te krijgen

```bash
gh workflow run "Deploy VinoMartino" --ref main -f target=production
```

(Vereist board-required-reviewer goedkeuring voor `production` environment.)

## Rollback (als reconcile zelf de site brak)

De snapshot uit stap 1 (`/tmp/prod-rollback-<ts>.json`) is geen direct-bruikbare
restore — Docker heeft geen ingebouwde "create-from-inspect-output". Maar de
snapshot bevat alle velden om de oude container handmatig te reconstrueren.

Praktisch:

1. Stop de net-gerecreëerde container.
2. Lees `/tmp/prod-rollback-<ts>.json` voor `Image`, `Mounts`, `Networks`,
   `Labels`, `RestartPolicy`.
3. Reconstrueer met `docker create ...` zoals in stap 4.

Voor de meeste drift-scenario's is rollback echter niet wat je wilt — de
gedrifte container was waarschijnlijk al kapot (anders had de pipeline geen
drift gemeld). De juiste recovery is "blijf bij compose-spec, fix de
onderliggende rsync of build".

## Bron-incident

- [LAT-909](/LAT/issues/LAT-909) — silent deploy-skew na manuele image-build,
  recovery via comment c501ce3a (handmatige `docker create` met expliciete
  binds + labels).
- [LAT-910](/LAT/issues/LAT-910) — sha-aware smoke-test die het probleem
  uiteindelijk via `/build-info.json` mismatch detecteerde.
- [LAT-914](/LAT/issues/LAT-914) — pipeline-hardening (deze runbook + drift
  check in `deploy.yml`).
