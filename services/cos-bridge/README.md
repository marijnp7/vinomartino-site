# cos-bridge — Chief of Staff bridge + monitor

Bron voor `/opt/paperclip-cos/` op de VPS.

## Wat staat hier

| pad | draait als | in versiebeheer sinds |
|---|---|---|
| `bridge/` | `paperclip-cos-bridge-1` | LAT-781 |
| `monitor/` | `paperclip-monitor-1` | **LAT-2802** |
| `sql/` | migraties op `paperclip-db-1` | **LAT-2802** |
| `test/` | los te draaien met `node` | **LAT-2802** |

`monitor/` en `sql/` bestonden vóór LAT-2802 uitsluitend op de host. Er was dus
geen enkele kopie van `monitor.js` in versiebeheer en geen review-pad voor de
migraties. Dat is met deze PR rechtgezet.

## Let op: alleen `bridge/` wordt door CI gedeployed

`.github/workflows/deploy-cos.yml` synct bij een push naar **`preview`**:

```
services/cos-bridge/bridge/           → /opt/paperclip-cos/bridge/   (rsync --delete)
services/cos-bridge/Dockerfile.bridge → /opt/paperclip-cos/Dockerfile.bridge
services/cos-bridge/docker-compose.cos.yml → /opt/paperclip-cos/docker-compose.cos.yml
```

`monitor/`, `sql/`, `test/` en `docker-compose.monitoring.yml` worden **niet**
gesynct. Die blijven handwerk op de host, met de gebruikelijke Marijn-gate.

Twee consequenties die je moet kennen voordat je hier iets wijzigt:

- Een merge naar `main` deployt niets. Een push naar `preview` die
  `services/cos-bridge/**` raakt, is wél een deploy.
- `rsync --delete` op `bridge/` betekent dat een bestand dat je hier weghaalt,
  bij de volgende deploy ook op de host verdwijnt.

## Migraties

Genummerd, idempotent, handmatig toepassen op `paperclip-db-1`:

```bash
docker exec -i paperclip-db-1 psql -U paperclip -d paperclip \
  < services/cos-bridge/sql/004_notifications.sql
```

Er is geen migratie-runner en geen versietabel — de bestanden zijn zo geschreven
dat ze meerdere keren draaien zonder schade (`IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`).

> Historische ruis: `003_deploy_triggers.sql` en `003_timeout_run_fields.sql`
> delen hetzelfde nummer. Ze raken verschillende tabellen en zijn allebei al
> toegepast; hernummeren zou alleen verwarring toevoegen.

## Endpoints

| endpoint | waarvoor |
|---|---|
| `GET /health` | liveness |
| `POST /approval` | een mens moet iets **beslissen** — knoppen, timeout, callback |
| `GET /approval/:id` | status van een beslissing |
| `POST /notify` | een mens moet iets **weten** — geen knoppen, geen timeout |

Kies `/notify` tenzij er echt een beslissing valt te nemen. Een drempel-alarm
via `/approval` levert knoppen op die niets doen: tussen 12-06 en 23-07 gaf dat
163 timeouts, 8 rejects en 5 approves die alle drie no-ops waren (LAT-2802).

### `POST /notify`

HMAC-ondertekend met `APPROVAL_HMAC_SECRET`, header `X-Signature: sha256=…`,
net als `/approval`.

| veld | verplicht | betekenis |
|---|---|---|
| `agent` | ja | vrije naam van de afzender |
| `title` | ja | kop van het Telegram-bericht |
| `body` | ja | tekst |
| `severity` | nee | `info` \| `warn` \| `critical`, default `info` |
| `request_id` | nee | alleen voor terugzoeken; **geen** dedup-sleutel |

Antwoorden: `202` bij succes (`{notification_id, delivered, suppressed,
truncated}`), `400` ongeldige invoer, `401` slechte signature, `502`
Telegram-fout, `503` geen HMAC-secret.

Gedragsverschillen met `/approval`, alle drie bewust:

- **Te lang bericht wordt afgekapt, niet afgewezen.** Bij een approval wacht
  iemand op een beslissing en die kan de tekst inkorten; bij een melding wacht
  niemand. Het budget wordt berekend op de definitieve, geëscapete string en
  knipt niet midden in een HTML-entity (`test/test-notify-truncate.mjs`).
- **De pauze-stand blokkeert `warn` en `critical` niet.** De pauze bestaat om
  Marijn niet met beslissingen lastig te vallen; een melding vraagt niets. Wat
  wél doorgaat krijgt een `⏸`-prefix. `info` — de herstelberichten — wordt bij
  pauze onderdrukt, maar de rij gaat altijd naar `cos.notifications` met
  `suppressed=true`.
- **Geen rij in `cos.actions`.** Wel in `cos.notifications`, anders is een
  gemiste push opnieuw spoorloos.

## Tests

Geen test-runner en geen dependencies; de tests lezen de échte broncode en
evalueren de betreffende functies met stubs.

```bash
node services/cos-bridge/test/test-notify-truncate.mjs   # afkap-budget, entity-veiligheid
node services/cos-bridge/test/test-backoff.mjs           # meldingsritme 1u→4u→12u
```
