-- Chief of Staff — meldingen zonder beslissing (LAT-2802)
--
-- Drempel-alarmen van paperclip-monitor liepen tot nu toe via cos.actions, de
-- tabel voor goedkeuringsvragen. Ze vragen echter niets: approve, deny én
-- timeout zijn er alle drie no-ops. Ze horen dus niet in cos.actions thuis —
-- maar ze mogen ook niet spoorloos zijn, en dat was de oorspronkelijke klacht.
-- Vandaar een eigen tabel: wat er is verstuurd, en of het is aangekomen.
--
-- Idempotent; veilig meerdere keren te draaien.

CREATE TABLE IF NOT EXISTS cos.notifications (
    id             BIGSERIAL PRIMARY KEY,
    -- Alleen voor terugzoeken. Bewust GEEN unieke index: een herhaalde melding
    -- na de backoff is legitiem, geen duplicaat.
    request_id     TEXT,
    agent          TEXT NOT NULL,
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    severity       TEXT NOT NULL DEFAULT 'info'
                   CHECK (severity IN ('info','warn','critical')),
    delivered      BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_error TEXT,
    -- Bericht ging over de Telegram-limiet van 4096 tekens en is afgekapt.
    truncated      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Derde toestand naast delivered/delivery_error: COS stond gepauzeerd en de
    -- melding was 'info' (een herstelbericht), dus bewust niet verstuurd.
    -- Onderdrukking is geen fout — vandaar een eigen kolom en niet een waarde
    -- in delivery_error.
    suppressed     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_created_idx
    ON cos.notifications (created_at DESC);

-- Geen retentie-beleid, bewust: met de backoff uit LAT-2802 §4 is de bovengrens
-- 2 meldingen per dag per conditie. Daar is opruimen nog jaren geen probleem
-- voor, en een lege tabel is een slechter antwoord dan een volle.
