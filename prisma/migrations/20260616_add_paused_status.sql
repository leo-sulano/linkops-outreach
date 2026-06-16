-- Add 'paused' to the lead_jobs status CHECK constraint
ALTER TABLE lead_jobs DROP CONSTRAINT IF EXISTS lead_jobs_status_check;
ALTER TABLE lead_jobs ADD CONSTRAINT lead_jobs_status_check
  CHECK (status IN ('pending','processing','completed','needs_review','failed','paused'));
