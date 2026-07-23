-- Chief of Staff — approval-flow uitbreiding
-- Voegt externe-agent approval-aanvragen toe aan cos.actions.
-- Idempotent; veilig meerdere keren te draaien.

ALTER TABLE cos.actions
    ADD COLUMN IF NOT EXISTS request_id        TEXT,           -- uuid van de aanvragende agent
    ADD COLUMN IF NOT EXISTS requester_agent   TEXT,           -- 'cto' | 'devops' | 'cowork-assistant' | ...
    ADD COLUMN IF NOT EXISTS urgency           TEXT
        DEFAULT 'normal'
        CHECK (urgency IN ('normal', 'critical')),
    ADD COLUMN IF NOT EXISTS callback_url      TEXT,           -- optioneel; bridge POST't hier de decision heen
    ADD COLUMN IF NOT EXISTS timeout_at        TIMESTAMPTZ;    -- na dit moment => decision='timeout'

-- Uniek op request_id zodat dezelfde aanvrager niet per ongeluk dubbel insert't.
CREATE UNIQUE INDEX IF NOT EXISTS actions_request_id_uniq
    ON cos.actions(request_id)
    WHERE request_id IS NOT NULL;

-- Index voor de timeout-watcher
CREATE INDEX IF NOT EXISTS actions_timeout_watch_idx
    ON cos.actions(timeout_at)
    WHERE decision IS NULL AND timeout_at IS NOT NULL;

-- Allow 'timeout' as decision value (bestaande kolom is TEXT zonder CHECK, dus OK — geen wijziging nodig)
