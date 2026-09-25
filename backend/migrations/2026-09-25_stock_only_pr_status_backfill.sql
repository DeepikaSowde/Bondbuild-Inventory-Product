-- Stock-only PRs stuck at "Approved" after their stock was collected.
--
-- A PR whose lines all come from stock never enters the QS / buy path, and
-- send-to-FIC left it APPROVED. Collecting the Stock PO closed the PO but never
-- touched the PR, so it kept showing "Approved". The code now moves it to
-- PO_RAISED when its last stock PO is collected (routes/purchaseOrders.js →
-- POST /:poNo/receive). This backfills PRs that were collected BEFORE that fix.
--
-- Only PRs that are unambiguously finished are moved: APPROVED, no buy lines, at
-- least one CLOSED stock PO, no OPEN PO left, and every stock line already issued
-- (STOCK_REDUCED). A PR whose only stock PO was cancelled is NOT touched.
-- Idempotent: once moved, a PR no longer matches (status is no longer APPROVED).
--
-- Run once per database (dev Neon, then production DigitalOcean). Run the PREVIEW
-- select first and check the PR numbers look right.

-- PREVIEW
-- SELECT pr.pr_no, pr.status
-- FROM purchase_requests pr
-- WHERE pr.status = 'APPROVED'
--   AND EXISTS     (SELECT 1 FROM purchase_orders po WHERE po.pr_id = pr.id AND po.po_type = 'STOCK' AND po.status = 'CLOSED')
--   AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.pr_id = pr.id AND po.status = 'OPEN')
--   AND NOT EXISTS (SELECT 1 FROM pr_items i WHERE i.pr_id = pr.id AND i.buy_qty > 0)
--   AND NOT EXISTS (SELECT 1 FROM pr_items i WHERE i.pr_id = pr.id AND i.stock_qty > 0
--                     AND COALESCE(i.stock_status, '') <> 'STOCK_REDUCED')
-- ORDER BY pr.pr_no;

WITH moved AS (
  UPDATE purchase_requests pr
     SET status = 'PO_RAISED'
   WHERE pr.status = 'APPROVED'
     AND EXISTS     (SELECT 1 FROM purchase_orders po WHERE po.pr_id = pr.id AND po.po_type = 'STOCK' AND po.status = 'CLOSED')
     AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.pr_id = pr.id AND po.status = 'OPEN')
     AND NOT EXISTS (SELECT 1 FROM pr_items i WHERE i.pr_id = pr.id AND i.buy_qty > 0)
     AND NOT EXISTS (SELECT 1 FROM pr_items i WHERE i.pr_id = pr.id AND i.stock_qty > 0
                       AND COALESCE(i.stock_status, '') <> 'STOCK_REDUCED')
  RETURNING pr.id
)
INSERT INTO pr_approvals (pr_id, action, from_status, to_status, actor, actor_role, note)
SELECT id, 'STOCK_COLLECTED', 'APPROVED', 'PO_RAISED', 'system', 'system',
       'Backfill: stock collected, request fulfilled from stock'
FROM moved;
