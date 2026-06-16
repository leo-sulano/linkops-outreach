-- Track which sub-page the scraper is currently visiting within a job
ALTER TABLE lead_jobs ADD COLUMN IF NOT EXISTS current_page TEXT;
