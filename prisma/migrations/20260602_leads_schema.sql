CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_found  DATE,
  vertical    TEXT,
  query       TEXT,
  domain      TEXT UNIQUE NOT NULL,
  url         TEXT,
  title       TEXT,
  type        TEXT NOT NULL DEFAULT 'Unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT UNIQUE NOT NULL,
  vertical          TEXT,
  company_type      TEXT,
  company_name      TEXT,
  company_email     TEXT,
  company_linkedin  TEXT,
  contact_name      TEXT,
  contact_role      TEXT,
  contact_linkedin  TEXT,
  new_lead          BOOLEAN NOT NULL DEFAULT TRUE,
  emailed           BOOLEAN NOT NULL DEFAULT FALSE,
  contacted         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL,
  domain        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','needs_review','failed')),
  retry_count   INT NOT NULL DEFAULT 0,
  error_log     TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_jobs_status_idx ON lead_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS lead_jobs_run_id_idx ON lead_jobs (run_id);

CREATE OR REPLACE FUNCTION update_lead_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_contacts_updated_at
  BEFORE UPDATE ON lead_contacts
  FOR EACH ROW EXECUTE FUNCTION update_lead_contacts_updated_at();
