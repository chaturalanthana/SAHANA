-- Purpose: record asset disposal once, and allow a period to be closed.
-- Tenant impact: none beyond a nullable column on fixed_assets.
-- Backfill: none.

ALTER TABLE fixed_assets ADD COLUMN disposed_at timestamptz;
