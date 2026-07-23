# Runbook — deployen op de `paperclip-cos` stack

Geldt voor alles wat op de VPS in `/opt/paperclip-cos` draait: de CoS-agent, de
CoS-bridge (approval- en deploy-kanaal), de Cloudflare-tunnel, de socket-proxy,
de monitoring, de publish-dispatcher en de vinomartino.nl-redirect.

Aanleiding: [LAT-2811](/LAT/issues/LAT-2811).

---

## De regel

**Deploy vanuit `/opt/paperclip-cos` met een kale `docker compose`. Zonder `-f`.**

```bash
cd /opt/paperclip-cos
docker compose up -d
```

`/opt/paperclip-cos/.env` zet `COMPOSE_FILE`, waardoor een kale aanroep alle
overlays laadt en dus alle acht services van het project kent.

### Waarom geen `-f`-subset

Compose bepaalt "orphan" door de containers met het label
`com.docker.compose.project=paperclip-cos` te vergelijken met de services in de
config die op dát moment geladen is. Geef je `-f docker-compose.cos.yml`, dan
kent compose vier services en zijn de andere vier orphans — inclusief de
Cloudflare-tunnel. Compose stelt in de waarschuwing zélf `--remove-orphans` voor.
Wie die suggestie opvolgt, verwijdert de tunnel en de CoS-agent.

Een `-f`-subset is op zichzelf niet destructief; de combinatie met
`--remove-orphans` is dat wel. Omdat de waarschuwing actief naar die vlag wijst,
behandelen we de subset als de fout die je vermijdt.

### Uitzondering: `.github/workflows/deploy-cos.yml`

De geautomatiseerde bridge-deploy gebruikt bewust wél een subset:

```bash
docker compose -f docker-compose.cos.yml up -d --build --force-recreate cos-bridge
```

Dat mag daar, om twee redenen:

1. De aanroep is gescoped op één service en bevat geen `--remove-orphans`, dus
   er wordt niets verwijderd.
2. `cos-bridge` is het approval-kanaal. Die deploy mag niet stukgaan omdat een
   ongerelateerde overlay (publish-dispatcher, nl-redirect) kapot is.

Een expliciete `-f` overrulet `COMPOSE_FILE` uit `.env`; dat is hier het
gewenste gedrag. De prijs is dat die stap twee overlay-services als orphan in de
log noemt. De workflow-stap *Verify merged compose config* bewaakt de dekking
apart en waarschuwt zodra een draaiende container geen definitie meer heeft.

---

## Bron versus artefact

| Pad op de VPS | Bron in de repo |
|---|---|
| `/opt/paperclip-cos/docker-compose.cos.yml` | `services/cos-bridge/docker-compose.cos.yml` |
| `/opt/paperclip-cos/.env` | `services/cos-bridge/compose.env` |
| `/opt/paperclip-cos/Dockerfile.bridge` | `services/cos-bridge/Dockerfile.bridge` |
| `/opt/paperclip-cos/bridge/` | `services/cos-bridge/bridge/` (met `--delete`) |

`deploy-cos.yml` rsynct deze over de VPS-versie heen bij elke push naar
`preview` die `services/cos-bridge/**` raakt, en bij `workflow_dispatch`.
**Een wijziging die alleen op de VPS staat, verdwijnt bij de eerstvolgende
bridge-deploy, zonder melding.** Dat is precies hoe de LAT-1005-hardening van
`cos-bridge` verloren is gegaan en hoe de drie service-definities uit
`docker-compose.cos.yml` verdwenen. Wijzig dus in de repo.

Nog niet in de repo (VPS-only, wél in `COMPOSE_FILE`):
`docker-compose.monitoring.yml`, `lat920/docker-compose.publish-dispatcher.yml`,
`docker-compose.vinomartino-nl-redirect.yml`. Die worden door geen enkele
workflow overschreven, maar zijn daarmee ook niet gereviewd of gebackupt.

---

## Een nieuwe service toevoegen

Voeg de service toe aan `services/cos-bridge/docker-compose.cos.yml`, of aan een
overlay die in `COMPOSE_FILE` van `services/cos-bridge/compose.env` staat — in
dezelfde commit waarin je de container aanmaakt. Doe je dat niet, dan draagt de
container wel het projectlabel maar heeft hij geen definitie, en is hij per
definitie een orphan.

---

## De Cloudflare-tunnel

`paperclip-cloudflared-1` is gepind op een image-digest, niet op `:latest`. Een
recreate mag geen ongeplande versie-bump zijn van de component die alle ingress
draagt. Upgraden is een aparte wijziging met een eigen test.

De ingress-regels zijn **remote-managed** via de Cloudflare API (tunnel
configuration version). `cloudflared-config.yml` op de VPS bevat alleen de
tunnel-identiteit en het credentials-pad. Een recreate haalt de ingress dus
opnieuw op bij de CF edge; hij zit niet in de container-config.

De tunnel hangt in drie netwerken en elke ingress-regel resolvet zijn origin via
docker-DNS in precies één daarvan:

| hostname | origin | netwerk |
|---|---|---|
| `deploy-hook.vinomartino.com` | `cos-bridge:3200` | `paperclip_default` |
| `approval.vinomartino.com` | `cos-bridge:3200` | `paperclip_default` |
| `webhook.vinomartino.com` | `paperclip:3100` | `paperclip_default` |
| `dam.vinomartino.com` | `resourcespace:80` | `paperclip_default` |
| `cms.vinomartino.com` | `vinomartino-directus-1:8055` | `directus_directus_net` |
| `preview.vinomartino.com` | `paperclip-vinomartino-preview-1:80` | `vinomartino-site_default` |

Valt een netwerk weg bij een recreate, dan blijft de tunnel gewoon geregistreerd
en gaat alleen dát hostname stuk. **"Tunnel is up" is dus geen bewijs dat de
ingress werkt.** Verifieer per hostname:

```bash
scripts/cos/verify-ingress.sh baseline /tmp/ingress-before.txt   # vóór de wijziging
# ... deploy ...
scripts/cos/verify-ingress.sh check /tmp/ingress-before.txt      # erna
```

Aanvullend, voor de bridge-hostnames mét service token:
`agents/cto/lat56-output/08-smoketest.command`.

---

## Vóór een wijziging die containers hercreëert

```bash
cd /opt/paperclip-cos

# 1. Wat gaat er gebeuren? Kale aanroep, dry-run.
docker compose up -d --dry-run

# 2. Backup van de compose-file die je aanraakt.
cp docker-compose.cos.yml docker-compose.cos.yml.bak-$(date +%Y%m%dT%H%M%SZ)

# 3. Volledige container-config wegschrijven, zodat handmatige hercreatie
#    mogelijk is als compose de container niet terugbrengt.
docker inspect paperclip-cloudflared-1 > /tmp/cloudflared-inspect-$(date +%Y%m%d).json

# 4. Ingress-baseline.
scripts/cos/verify-ingress.sh baseline /tmp/ingress-before.txt
```

Lees de dry-run-output regel voor regel. `Running` betekent onaangeraakt,
`Recreate` betekent dat die container stopt en opnieuw wordt aangemaakt.

---

## Rollback

De rollback loopt **niet** via de tunnel. SSH naar de VPS gaat direct naar de
host: de tunnel-ingress is HTTP-only, `warp-routing` staat uit en er is geen
`ssh://`-regel. Ligt de tunnel plat, dan kom je er nog steeds bij.

```bash
cd /opt/paperclip-cos
cp docker-compose.cos.yml.bak-<ts> docker-compose.cos.yml
docker compose up -d          # zonder --remove-orphans
```

Brengt compose een container niet terug, hercreëer dan handmatig uit de
`docker inspect`-dump van stap 3 hierboven.

Doelstelling: < 2 minuten. Zie ook `/paperclip/infra/devops-workspace/ROLLBACK.md`.

---

## Nooit

- `--remove-orphans` op deze stack. Ook niet als compose het voorstelt.
- `docker compose down` vanuit `/opt/paperclip-cos` met de kale aanroep — dat
  stopt nu alle acht services, inclusief de tunnel.
- Een compose-file op de VPS bewerken in plaats van in de repo.
