-- LAT-56 — deploy-triggers tabel
--
-- Volg naming-pattern van 002_approval_flow.sql. Deze migratie wordt NIET
-- inline gedraaid door de bridge-startup — Marijn draait 'm expliciet via:
--
--   docker exec -i paperclip-db-1 psql -U $PGUSER -d $PGDATABASE \
--     < /opt/paperclip-cos/sql/003_deploy_triggers.sql
--
-- Bestandsnaam op de VPS: sql/003_deploy_triggers.sql (relatief aan de cos-
-- build-directory, zelfde plek als 001 en 002).
--
-- Idempotent: kan meerdere keren gedraaid worden.

CREATE TABLE IF NOT EXISTS cos.deploy_triggers (
    id              BIGSERIAL PRIMARY KEY,
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source          TEXT NOT NULL DEFAULT 'unknown',   -- 'github-actions' | 'manual' | 'cron' | ...
    cf_access_sub   TEXT,                              -- 'sub' uit het CF Access JWT (identificeert service-token / user)
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at    TIMESTAMPTZ                        -- NULL zolang een worker het nog niet heeft opgepakt
);

-- Index voor dashboard-queries: recent triggers eerst
CREATE INDEX IF NOT EXISTS deploy_triggers_triggered_idx
    ON cos.deploy_triggers(triggered_at DESC);

-- Partial index voor worker-polling: alleen onverwerkte triggers
CREATE INDEX IF NOT EXISTS deploy_triggers_unprocessed_idx
    ON cos.deploy_triggers(triggered_at)
    WHERE processed_at IS NULL;

-- Index op source voor per-bron analyses
CREATE INDEX IF NOT EXISTS deploy_triggers_source_idx
    ON cos.deploy_triggers(source, triggered_at DESC);

COMMENT ON TABLE cos.deploy_triggers IS
    'CI/CD deploy-triggers ontvangen via POST /webhook/deploy (CF Access beveiligd). Een worker pollt processed_at IS NULL en doet het feitelijke deploy-werk; out of scope voor LAT-56.';

