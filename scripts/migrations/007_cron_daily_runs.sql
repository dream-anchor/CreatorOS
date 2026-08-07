-- 007_cron_daily_runs.sql
-- Tagesschalter für Cron-Jobs, die pro Kalendertag genau EINMAL laufen dürfen.
--
-- Hintergrund: Das Cloudflare-Konto hat nur 5 Cron-Trigger (Free-Plan). Die
-- beiden CreatorOS-Zeitpläne wurden zu einem einzigen 15-Minuten-Takt
-- zusammengelegt. Der 15-Minuten-Takt trifft die Zielstunde viermal — ohne
-- Schutz liefe die Post-Generierung vierfach. Ein reines Zeitfenster reicht
-- nicht: fällt ein Lauf aus, muss der nächste Tick nachholen dürfen.
--
-- Deshalb: atomarer Anspruch (claim) in der Datenbank statt Verlass auf den Takt.
-- INSERT ... ON CONFLICT DO NOTHING/UPDATE ist unter Nebenläufigkeit atomar;
-- wer 0 Zeilen zurückbekommt, hat den Tag nicht bekommen und überspringt.

CREATE TABLE IF NOT EXISTS cron_daily_runs (
  job_name    text        NOT NULL,
  run_date    date        NOT NULL,
  status      text        NOT NULL DEFAULT 'running',  -- running | done | failed
  attempts    integer     NOT NULL DEFAULT 1,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  details     jsonb,
  PRIMARY KEY (job_name, run_date)
);

COMMENT ON TABLE cron_daily_runs IS
  'Tagesschalter für Cron-Jobs mit "genau einmal pro Tag"-Semantik (siehe workers/api/src/routes/cron.ts).';

CREATE INDEX IF NOT EXISTS idx_cron_daily_runs_claimed_at
  ON cron_daily_runs (claimed_at DESC);
