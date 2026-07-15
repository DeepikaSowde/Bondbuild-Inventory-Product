-- ─────────────────────────────────────────────────────────────────────────────
-- Request for Quotation gate on PR buy lines.
--
-- The Purchaser must request a quotation from each supplier before the Buy PO can
-- be generated. `quote_requested_at` is stamped on a supplier's buy lines when its
-- RFQ is requested; generate-pos rejects any buy line still NULL. Existing rows
-- backfill to NULL — historical PRs whose POs are already raised are unaffected
-- (the gate only runs while a PR is still APPROVED and awaiting its Buy PO).
--
-- DO NOT RUN BLIND. The target is the live DigitalOcean production database.
-- Additive and idempotent (ADD COLUMN IF NOT EXISTS), safe to re-run. This is also
-- applied automatically at app startup (backend/src/index.js).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE pr_items
  ADD COLUMN IF NOT EXISTS quote_requested_at TIMESTAMPTZ;

COMMIT;

-- Rollback, if needed:
--   BEGIN;
--   ALTER TABLE pr_items DROP COLUMN IF EXISTS quote_requested_at;
--   COMMIT;
