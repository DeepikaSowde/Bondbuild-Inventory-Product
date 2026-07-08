-- ─────────────────────────────────────────────────────────────────────────────
-- Per-item attachments + OneDrive link on PR items.
--
-- DO NOT RUN BLIND. The target is the live DigitalOcean production database.
-- Read the pre-flight check below, run it first, and only then apply this file.
--
-- Pre-flight (run separately, confirm it returns 0):
--     SELECT count(*) FROM pr_item_attachments;
--
-- An empty `pr_item_attachments` table already exists on production. It was
-- created by backend/fix_pr_item_attachments.js and never wired to any code
-- (zero references in backend/src or frontend/src). It is keyed on `pr_item_id`,
-- which is the wrong key -- see the comment on the new table below -- so this
-- migration drops and recreates it. The DO block refuses to drop it if it has
-- picked up any rows since this was written.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Stable per-item identity ------------------------------------------------
-- pr_items rows are DELETEd and re-INSERTed wholesale on every PR edit
-- (routes/purchaseRequests.js), so pr_items.id is not stable across an edit.
-- line_no is not stable either: flattenItems() in the frontend assigns it
-- positionally (idx + 1), so deleting visual item 2 renumbers item 3 -> 2.
-- item_uid is minted once per visual item and carried through edits.
--
-- NOTE: several pr_items rows can share one item_uid -- one row per source
-- pallet plus a buy row -- exactly as they already share a line_no.
ALTER TABLE pr_items ADD COLUMN IF NOT EXISTS item_uid     text;
ALTER TABLE pr_items ADD COLUMN IF NOT EXISTS onedrive_url text;

-- Backfill existing rows: rows sharing (pr_id, line_no) are one logical item,
-- so they must receive one shared uid.
-- gen_random_uuid() is core from PostgreSQL 13 on; if this errors, the server is
-- older and needs `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first.
UPDATE pr_items pi
SET    item_uid = g.uid
FROM  (SELECT pr_id, line_no, gen_random_uuid()::text AS uid
       FROM   pr_items
       WHERE  item_uid IS NULL
       GROUP  BY pr_id, line_no) g
WHERE  pi.pr_id = g.pr_id
  AND  pi.line_no = g.line_no
  AND  pi.item_uid IS NULL;

CREATE INDEX IF NOT EXISTS idx_pr_items_uid ON pr_items (pr_id, item_uid);

-- 2. Replace the orphaned attachments table ----------------------------------
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.pr_item_attachments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.pr_item_attachments' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION
        'pr_item_attachments holds % row(s) -- refusing to drop. Inspect it before migrating.', n;
    END IF;
    DROP TABLE public.pr_item_attachments;
  END IF;
END $$;

-- Keyed on (pr_id, item_uid), never pr_items.id -- see note 1 above.
-- No FK to pr_items is possible: (pr_id, item_uid) is not unique there, because
-- one logical item legitimately spans several rows. The FK to purchase_requests
-- gives us the cascade that matters.
CREATE TABLE pr_item_attachments (
  id            serial PRIMARY KEY,
  pr_id         integer NOT NULL REFERENCES purchase_requests (id) ON DELETE CASCADE,
  item_uid      text    NOT NULL,
  original_name text    NOT NULL,
  stored_name   text    NOT NULL,
  file_path     text    NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   text,
  created_at    timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_pr_item_att_pr   ON pr_item_attachments (pr_id);
CREATE INDEX idx_pr_item_att_item ON pr_item_attachments (pr_id, item_uid);

COMMIT;

-- Rollback, if needed:
--   BEGIN;
--   DROP TABLE IF EXISTS pr_item_attachments;
--   DROP INDEX IF EXISTS idx_pr_items_uid;
--   ALTER TABLE pr_items DROP COLUMN IF EXISTS onedrive_url;
--   ALTER TABLE pr_items DROP COLUMN IF EXISTS item_uid;
--   COMMIT;
-- Files already written to backend/uploads/pr-item-attachments/ are not removed
-- by the rollback; delete that directory by hand if you are abandoning this.
