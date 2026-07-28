-- Carry the PR's Colour code and overall Remark onto the Purchase Order.
--   • pr_items.colour            -> po_items.colour          (per line)
--   • purchase_requests.remarks  -> purchase_orders.remarks  (header, per PO)
-- Both already exist on the PR side; the PO side had no home for them, so they
-- were dropped at PO generation. Nullable + IF NOT EXISTS so this is safe to run
-- on an existing database; historical POs keep NULL (blank) for both.
ALTER TABLE po_items
  ADD COLUMN IF NOT EXISTS colour TEXT;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Rollback:
--   ALTER TABLE po_items        DROP COLUMN IF EXISTS colour;
--   ALTER TABLE purchase_orders DROP COLUMN IF EXISTS remarks;
