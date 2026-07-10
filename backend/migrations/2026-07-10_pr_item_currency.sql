-- ─────────────────────────────────────────────────────────────────────────────
-- Per-item currency on PR buy lines.
--
-- The Purchaser picks a currency (alongside supplier + unit price) when assigning
-- the buy portion of a PR. SGD is the default so every existing row and every new
-- PR keeps behaving exactly as before.
--
-- DO NOT RUN BLIND. The target is the live DigitalOcean production database.
-- This is additive and idempotent (ADD COLUMN IF NOT EXISTS + a DEFAULT), so it is
-- safe to re-run, but read it before applying.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 3-char ISO code, mirrors inventory.currency. Existing rows backfill to SGD via
-- the column default; the CHECK keeps the value to the set the UI offers.
ALTER TABLE pr_items
  ADD COLUMN IF NOT EXISTS currency character varying(3) NOT NULL DEFAULT 'SGD';

ALTER TABLE pr_items DROP CONSTRAINT IF EXISTS pr_items_currency_check;
ALTER TABLE pr_items
  ADD CONSTRAINT pr_items_currency_check
  CHECK (currency IN ('SGD','EUR','USD','CNY','JPY','INR','MYR'));

COMMIT;

-- Rollback, if needed:
--   BEGIN;
--   ALTER TABLE pr_items DROP CONSTRAINT IF EXISTS pr_items_currency_check;
--   ALTER TABLE pr_items DROP COLUMN IF EXISTS currency;
--   COMMIT;
