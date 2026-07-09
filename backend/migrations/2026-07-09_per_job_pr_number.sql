-- ─────────────────────────────────────────────────────────────────────────────
-- Per-JOB purchase-request numbering.
--
-- Client requirement: PR numbers restart per job. JN426 → JN426/PR-001,
-- JN426/PR-002, …; a different job JN100 starts its own JN100/PR-001.
--
-- pr_no stays the single UNIQUE routing key used everywhere (URL param,
-- purchase_orders.pr_no, po_notifications.ref_pr). We just store the combined
-- job+sequence value in it, so no schema-wide refactor is needed. This mirrors
-- how PO numbers already carry slashes and route fine as :poNo.
--
-- DESTRUCTIVE: this clears ALL existing purchase requests and purchase orders.
-- The client confirmed every PR/PO is throwaway test data. NOTHING structural is
-- dropped here — no table, no column. Only row data is deleted (plus the old
-- numbering function + sequence, which the new function below replaces).
-- Physical stock that was already issued (stock_movements OUT rows, decremented
-- quantity_in_stock) is NOT restored — that is historical inventory truth. Only
-- the *reservations* those wiped PRs were holding are released (reserved_qty → 0),
-- so stock is not left phantom-reserved by requests that no longer exist.
--
-- Pre-flight (optional sanity check before running):
--     SELECT count(*) FROM purchase_requests;   -- these rows will be deleted
--     SELECT count(*) FROM purchase_orders;      -- these rows will be deleted
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Wipe the PR/PO test dataset (rows only; tables & columns are untouched) -----
-- CASCADE reaches every child: pr_items, pr_approvals, pr_attachments,
-- pr_item_attachments (off purchase_requests) and po_items, po_approvals,
-- po_delivery_tracking, po_receive_photos (off purchase_orders).
TRUNCATE purchase_requests, purchase_orders RESTART IDENTITY CASCADE;

-- po_notifications references PRs/POs by TEXT (ref_pr / ref_po), no FK, so it is
-- not reached by the TRUNCATE above. Drop the now-dangling lifecycle messages.
DELETE FROM po_notifications WHERE ref_pr IS NOT NULL OR ref_po IS NOT NULL;

-- Release reservations held by the wiped PRs. reserved_qty is only ever raised by
-- the PR send-to-FIC flow, so with all PRs gone the correct value is zero.
UPDATE inventory SET reserved_qty = 0 WHERE reserved_qty <> 0;

-- 2. Replace the global counter with a per-job one -------------------------------
-- The old next_pr_no() drew from a single global sequence (PR001, PR002, … across
-- all jobs). Drop it and the sequence; neither is referenced any longer.
DROP FUNCTION IF EXISTS next_pr_no();
DROP SEQUENCE IF EXISTS pr_number_seq;

-- New signature takes the job number. It serialises number assignment PER JOB with
-- a transaction-scoped advisory lock (released automatically at COMMIT/ROLLBACK),
-- so two PRs raised for the same job at the same instant can't collide on a number.
-- Different jobs hash to different lock keys and never wait on each other.
-- Must be called inside a transaction — the create route already is.
CREATE OR REPLACE FUNCTION next_pr_no(p_job TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_seq INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_job));
  SELECT COALESCE(MAX(CAST(SUBSTRING(pr_no FROM '/PR-([0-9]+)$') AS INTEGER)), 0) + 1
    INTO v_seq
    FROM purchase_requests
   WHERE job_no = p_job;
  RETURN p_job || '/PR-' || LPAD(v_seq::TEXT, 3, '0');
END; $$;

COMMIT;

-- Rollback note: this migration deletes data. A rollback can only restore the
-- old function shape, not the wiped rows:
--   DROP FUNCTION IF EXISTS next_pr_no(text);
--   CREATE SEQUENCE IF NOT EXISTS pr_number_seq START 1;
--   CREATE OR REPLACE FUNCTION next_pr_no() RETURNS TEXT LANGUAGE plpgsql AS $$
--   DECLARE v INTEGER; BEGIN v := nextval('pr_number_seq');
--     RETURN 'PR' || LPAD(v::TEXT, 3, '0'); END; $$;
