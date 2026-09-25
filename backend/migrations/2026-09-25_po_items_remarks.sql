-- PO line remarks: print the PR's per-line REMARKS on the PO PDF.
--
-- New POs get po_items.remarks stamped at generation (routes/purchaseRequests.js).
-- The column itself is also created idempotently at backend boot (src/index.js), so
-- STEP 1 below is only needed if you run this file before deploying the code.
--
-- STEP 2 backfills POs raised BEFORE the column existed. It re-derives each PO
-- line's description exactly the way generate-pos builds it (material + " — " +
-- process label + " (1a)" stage ref) and copies the PR line's remark ONLY when
-- exactly one PR line matches — an ambiguous line is left blank rather than guessed.
-- Idempotent: it only ever fills lines whose remarks are still NULL.
--
-- Run once per database (dev Neon, then production DigitalOcean). Run the PREVIEW
-- select first and sanity-check a few rows against the PR form before the UPDATE.

-- STEP 1 ─ column
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS remarks TEXT;

-- PREVIEW ─ how many lines the backfill would fill, split by PO type
-- WITH cand AS (
--   SELECT pi.id AS po_item_id, NULLIF(BTRIM(pri.remarks), '') AS remarks, po.po_type
--   FROM po_items pi
--   JOIN purchase_orders po ON po.id = pi.po_id AND po.pr_id IS NOT NULL
--   JOIN pr_items pri ON pri.pr_id = po.pr_id
--    AND ( (po.po_type = 'BUY' AND pri.supplier_id = po.supplier_id AND pi.qty = pri.buy_qty
--           AND pi.description = (
--                CASE WHEN COALESCE(pri.purpose,'') <> '' THEN pri.description || ' — ' || pri.purpose ELSE pri.description END
--             || CASE WHEN COALESCE(pri.line_suffix,'') <> ''
--                     THEN ' (' || pri.line_no || pri.line_suffix
--                          || CASE WHEN COALESCE(pri.source_track,'') <> '' THEN '·' || pri.source_track ELSE '' END || ')'
--                     ELSE '' END))
--       OR (po.po_type = 'STOCK' AND pri.stock_qty > 0 AND pi.qty = pri.stock_qty
--           AND pi.description = pri.description
--           AND pi.profile_code IS NOT DISTINCT FROM pri.profile_code) )
--   WHERE pi.remarks IS NULL
-- )
-- SELECT po_type, COUNT(*) AS lines_that_would_be_filled
-- FROM (SELECT po_item_id, MAX(remarks) AS remarks, MAX(po_type) AS po_type
--       FROM cand GROUP BY po_item_id HAVING COUNT(*) = 1 AND MAX(remarks) IS NOT NULL) x
-- GROUP BY po_type;

-- STEP 2 ─ backfill
WITH cand AS (
  SELECT pi.id AS po_item_id, NULLIF(BTRIM(pri.remarks), '') AS remarks
  FROM po_items pi
  JOIN purchase_orders po ON po.id = pi.po_id AND po.pr_id IS NOT NULL
  JOIN pr_items pri ON pri.pr_id = po.pr_id
   AND ( (po.po_type = 'BUY' AND pri.supplier_id = po.supplier_id AND pi.qty = pri.buy_qty
          AND pi.description = (
               CASE WHEN COALESCE(pri.purpose,'') <> '' THEN pri.description || ' — ' || pri.purpose ELSE pri.description END
            || CASE WHEN COALESCE(pri.line_suffix,'') <> ''
                    THEN ' (' || pri.line_no || pri.line_suffix
                         || CASE WHEN COALESCE(pri.source_track,'') <> '' THEN '·' || pri.source_track ELSE '' END || ')'
                    ELSE '' END))
      OR (po.po_type = 'STOCK' AND pri.stock_qty > 0 AND pi.qty = pri.stock_qty
          AND pi.description = pri.description
          AND pi.profile_code IS NOT DISTINCT FROM pri.profile_code) )
  WHERE pi.remarks IS NULL
), uniq AS (
  SELECT po_item_id, MAX(remarks) AS remarks
  FROM cand
  GROUP BY po_item_id
  HAVING COUNT(*) = 1 AND MAX(remarks) IS NOT NULL
)
UPDATE po_items pi
SET remarks = u.remarks
FROM uniq u
WHERE pi.id = u.po_item_id;
