-- Chief of Staff — run/issue koppeling voor timeout-afhandeling
-- Sla de Paperclip run-id en issue-id op bij elke approval-aanvraag zodat de
-- timeout-watcher de wachtende run kan annuleren en het issue op 'blocked' kan zetten.
-- Idempotent; veilig meerdere keren te draaien.

ALTER TABLE cos.actions
    ADD COLUMN IF NOT EXISTS paperclip_run_id   TEXT,   -- PAPERCLIP_RUN_ID van de aanvragende agent
    ADD COLUMN IF NOT EXISTS paperclip_issue_id TEXT;   -- Issue-ID dat de run afhandelt (bijv. LAT-119)

-- Index voor efficiënte opzoek op run_id (bij cancel-bevestiging)
CREATE INDEX IF NOT EXISTS actions_run_id_idx
    ON cos.actions(paperclip_run_id)
    WHERE paperclip_run_id IS NOT NULL;
