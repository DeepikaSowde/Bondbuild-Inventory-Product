-- ─────────────────────────────────────────────────────────────────────────────
-- Currency on purchase_orders — carries the buy-line currency through to the PO.
--
-- When a Buy PO is generated, each PO now inherits the currency the Purchaser
-- assigned on the PR (POs are grouped per supplier + currency, so one PO is
-- always a single currency). STOCK POs and legacy rows default to SGD, so the PO
-- list/detail/PDF behave exactly as before until a non-SGD PR is raised.
--
-- DO NOT RUN BLIND — target is the live DigitalOcean production database.
-- Additive and idempotent (ADD COLUMN IF NOT EXISTS + DEFAULT); safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS currency character varying(3) NOT NULL DEFAULT 'SGD';

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_currency_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_currency_check
  CHECK (currency IN ('SGD','EUR','USD','CNY','JPY','INR','MYR'));

COMMIT;

-- Rollback, if needed:
--   BEGIN;
--   ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_currency_check;
--   ALTER TABLE purchase_orders DROP COLUMN IF EXISTS currency;
--   COMMIT;
