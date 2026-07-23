-- Chief of Staff — Postgres schema
-- Draait in paperclip-db-1 (postgres:16), database "paperclip" (of eigen db "cos")
-- Idempotent: kan meerdere keren gedraaid worden

CREATE SCHEMA IF NOT EXISTS cos;

-- Pauze-state + heartbeat. 1 rij totaal (singleton).
CREATE TABLE IF NOT EXISTS cos.state (
    id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    paused          BOOLEAN NOT NULL DEFAULT FALSE,
    paused_reason   TEXT,
    paused_at       TIMESTAMPTZ,
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO cos.state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Topic-mapping: naam ↔ telegram thread_id.
-- Bridge vult dit bij eerste run automatisch.
CREATE TABLE IF NOT EXISTS cos.topics (
    slug            TEXT PRIMARY KEY,           -- 'algemeen', 'content', 'inbox', ...
    display_name    TEXT NOT NULL,
    thread_id       BIGINT UNIQUE,              -- NULL tot eerste bericht erin binnenkomt
    discovered_at   TIMESTAMPTZ
);
INSERT INTO cos.topics (slug, display_name) VALUES
    ('algemeen', '🟢 Algemeen'),
    ('content',  '📝 Content'),
    ('inbox',    '📬 Inbox'),
    ('infra',    '🛠️ Infra'),
    ('planning', '⏰ Planning'),
    ('alerts',   '🚨 Alerts')
ON CONFLICT (slug) DO NOTHING;

-- Actions = elk voorstel + besluit dat de CoS aan Marijn voorlegt
CREATE TABLE IF NOT EXISTS cos.actions (
    id              BIGSERIAL PRIMARY KEY,
    topic_slug      TEXT REFERENCES cos.topics(slug),
    proposal        TEXT NOT NULL,              -- wat de CoS wilde doen
    category        TEXT NOT NULL,              -- 'email', 'agent-brief', 'vps', 'planning', 'content', ...
    decision        TEXT,                       -- 'approve' | 'reject' | 'modify' | NULL (nog open)
    decision_note   TEXT,                       -- Marijn's tekst bij modify
    executed        BOOLEAN NOT NULL DEFAULT FALSE,
    execution_log   TEXT,                       -- wat er echt is gebeurd (of foutmelding)
    cost_tokens_in  INTEGER,
    cost_tokens_out INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at      TIMESTAMPTZ,
    executed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS actions_created_idx ON cos.actions(created_at DESC);
CREATE INDEX IF NOT EXISTS actions_undecided_idx ON cos.actions(created_at) WHERE decision IS NULL;

-- Conversatie-threads per topic, zodat de CoS context vasthoudt per onderwerp
CREATE TABLE IF NOT EXISTS cos.conversations (
    id              BIGSERIAL PRIMARY KEY,
    topic_slug      TEXT NOT NULL REFERENCES cos.topics(slug),
    telegram_msg_id BIGINT,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conv_topic_created_idx ON cos.conversations(topic_slug, created_at);

-- Dagelijks budget-tracking. Één rij per dag.
CREATE TABLE IF NOT EXISTS cos.budget (
    day             DATE PRIMARY KEY,
    tokens_in       BIGINT NOT NULL DEFAULT 0,
    tokens_out      BIGINT NOT NULL DEFAULT 0,
    cost_eur_cents  INTEGER NOT NULL DEFAULT 0,
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper-view: open voorstellen van vandaag
CREATE OR REPLACE VIEW cos.open_proposals AS
    SELECT id, topic_slug, category, proposal, created_at
    FROM cos.actions
    WHERE decision IS NULL
    ORDER BY created_at;
