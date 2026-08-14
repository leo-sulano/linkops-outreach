-- Persist the two AI-extracted flags that scraping already computes but previously discarded
ALTER TABLE lead_contacts
  ADD COLUMN IF NOT EXISTS accepts_guest_posts BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_advertise_page BOOLEAN NOT NULL DEFAULT FALSE;
