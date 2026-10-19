# cos-stack deploy (`/opt/paperclip-cos`, project `paperclip-cos`)

LAT-2811. Elke container met label `com.docker.compose.project=paperclip-cos` heeft een
service-definitie. `/opt/paperclip-cos/.env` (bron: `services/cos-bridge/compose.env`,
gersynct door `deploy-cos.yml`) zet `COMPOSE_FILE` op alle vijf de files.

- **Canoniek:** kale `docker compose ...` vanuit `/opt/paperclip-cos`. Nooit een `-f`-subset:
  een subset ziet de rest als orphan, en `--remove-orphans` verwijdert ze dan.
- **Uitzondering, bewust:** `deploy-cos.yml` draait
  `docker compose -f docker-compose.cos.yml up -d --build --force-recreate cos-bridge`.
  Mag daar: gescoped op één service, geen `--remove-orphans`, en het approval-kanaal mag niet
  stukgaan aan een kapotte overlay.
- **`paperclip-cloudflared-1` hoort hier niet bij.** Sinds 7 okt 2026 draait hij buiten
  compose en draagt hij ook de SSH-route (LAT-3437). Niet terug in dit project halen zonder
  eigen venster: een recreate neemt ingress én SSH tegelijk weg.
- Vóór elke `up`: `docker compose up -d --dry-run` en lees elke `Recreate`/`Remove`-regel.
- Nieuwe service in deze stack? Dan ook in `compose.env` (`COMPOSE_FILE`), anders is hij orphan.
