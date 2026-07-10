-- ============================================================
-- InventoryOpz — Neon Production Migration
-- Safe to run multiple times (all IF NOT EXISTS / IF EXISTS).
-- Run this in: Neon Console → SQL Editor → paste → Run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- STEP 0 ▸ Check what tables already exist first
--   Paste just this block, run it, note what's missing,
--   then run the blocks below as needed.
-- ────────────────────────────────────────────────────────────
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
ORDER  BY table_name;


-- ════════════════════════════════════════════════════════════
-- BLOCK A — PR / PO MODULE CORE TABLES
-- (safe to run even if they already exist)
-- ════════════════════════════════════════════════════════════

-- A1. PO Projects (job number registry)
CREATE TABLE IF NOT EXISTS po_projects (
  id           SERIAL PRIMARY KEY,
  job_no       TEXT   NOT NULL UNIQUE,
  project_name TEXT   NOT NULL,
  location     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- A2. Suppliers
CREATE TABLE IF NOT EXISTS po_suppliers (
  id             SERIAL PRIMARY KEY,
  name           TEXT    NOT NULL UNIQUE,
  type           TEXT    NOT NULL DEFAULT 'Local' CHECK (type IN ('Local','China','Europe','Other')),
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- A3. Notifications / inbox
CREATE TABLE IF NOT EXISTS po_notifications (
  id         SERIAL PRIMARY KEY,
  role       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  type       TEXT DEFAULT 'info',
  ref_pr     TEXT,
  ref_po     TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- A4. PR/PO role permissions
CREATE TABLE IF NOT EXISTS pr_po_permissions (
  id               SERIAL PRIMARY KEY,
  role             TEXT NOT NULL UNIQUE,
  raise_pr         BOOLEAN NOT NULL DEFAULT FALSE,
  approve_pr       BOOLEAN NOT NULL DEFAULT FALSE,
  reject_pr        BOOLEAN NOT NULL DEFAULT FALSE,
  assign_supplier  BOOLEAN NOT NULL DEFAULT FALSE,
  send_to_fic      BOOLEAN NOT NULL DEFAULT FALSE,
  issue_stock      BOOLEAN NOT NULL DEFAULT FALSE,
  generate_po      BOOLEAN NOT NULL DEFAULT FALSE,
  set_delivery     BOOLEAN NOT NULL DEFAULT FALSE,
  receive_po       BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_po        BOOLEAN NOT NULL DEFAULT FALSE,
  see_pr_price     BOOLEAN NOT NULL DEFAULT FALSE,
  see_po_price     BOOLEAN NOT NULL DEFAULT FALSE,
  see_po_amount    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default permissions (do nothing if rows exist)
INSERT INTO pr_po_permissions (role, raise_pr, approve_pr, reject_pr, assign_supplier, send_to_fic, issue_stock, generate_po, set_delivery, receive_po, cancel_po, see_pr_price, see_po_price, see_po_amount)
VALUES
  ('Drafter',           TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Manager',           FALSE, TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE ),
  ('Purchaser',         FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE, TRUE,  FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE ),
  ('Factory In-charge', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  FALSE, TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE),
  ('Supervisor',        FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE),
  ('QS',                FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE ),
  ('Admin',             TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE )
ON CONFLICT (role) DO NOTHING;

-- A5. (removed) The old global pr_number_seq is gone — PR numbers are now
--     per-job, derived inside next_pr_no(p_job) below. See migrations/
--     2026-07-09_per_job_pr_number.sql for the cut-over on existing databases.

-- A6. Helper function: next PR number (per job).
--     Returns e.g. JN426/PR-001, restarting the sequence for each job_no.
--     A transaction-scoped advisory lock serialises assignment per job so two
--     concurrent PRs on the same job can't collide; different jobs never wait on
--     each other. Must be called inside a transaction (the create route is).
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

-- A7. Helper function: next Buy PO number
CREATE OR REPLACE FUNCTION next_po_no(p_job TEXT, p_pr TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_yy     TEXT    := TO_CHAR(NOW(), 'YY');
  v_mm     TEXT    := TO_CHAR(NOW(), 'MM');
  v_prefix TEXT    := v_yy || v_mm || 'P';
  v_seq    INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM purchase_orders
  WHERE po_type = 'BUY'
    AND po_no ~ (v_prefix || '[0-9]+$');
  RETURN p_job || '/' || p_pr || '/' || v_yy || '/' || v_prefix || LPAD(v_seq::TEXT, 3, '0');
END; $$;

-- A8. Helper function: next Stock PO number
CREATE OR REPLACE FUNCTION next_stock_po_no(p_job TEXT, p_pr TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_yy     TEXT    := TO_CHAR(NOW(), 'YY');
  v_mm     TEXT    := TO_CHAR(NOW(), 'MM');
  v_prefix TEXT    := v_yy || v_mm || 'S';
  v_seq    INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM purchase_orders
  WHERE po_type = 'STOCK'
    AND po_no ~ (v_prefix || '[0-9]+$');
  RETURN p_job || '/' || p_pr || '/' || v_yy || '/' || v_prefix || LPAD(v_seq::TEXT, 3, '0');
END; $$;

-- A9. Purchase Requests
CREATE TABLE IF NOT EXISTS purchase_requests (
  id               SERIAL PRIMARY KEY,
  pr_no            TEXT   NOT NULL UNIQUE,
  job_no           TEXT   NOT NULL,
  project_name     TEXT,
  location         TEXT,
  date_required    TEXT,
  date_issued      DATE,
  pic              TEXT,
  requested_by     TEXT   NOT NULL,
  checked_by       TEXT,
  approved_by      TEXT,
  remarks          TEXT,
  status           TEXT   NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','APPROVED','SEND_BACK','REJECTED','PO_RAISED')),
  rejection_type   TEXT,
  rejection_reason TEXT,
  approved_date    DATE,
  created_by       UUID   REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_status    ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_job_no    ON purchase_requests(job_no);

-- A10. PR Line Items
CREATE TABLE IF NOT EXISTS pr_items (
  id              SERIAL PRIMARY KEY,
  pr_id           INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  line_no         INTEGER NOT NULL DEFAULT 1,
  profile_code    TEXT,
  description     TEXT    NOT NULL,
  colour          TEXT,
  qty             NUMERIC NOT NULL DEFAULT 0,
  unit            TEXT    NOT NULL DEFAULT 'pcs',
  remarks         TEXT,
  stock_qty       NUMERIC NOT NULL DEFAULT 0,
  inventory_id    INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  stock_location  TEXT,
  stock_status    TEXT    NOT NULL DEFAULT 'NONE'
                  CHECK (stock_status IN ('NONE','AWAITING_PURCHASER','PENDING_FIC','STOCK_REDUCED')),
  buy_qty         NUMERIC NOT NULL DEFAULT 0,
  supplier_id     INTEGER REFERENCES po_suppliers(id) ON DELETE SET NULL,
  supplier_name   TEXT,
  supplier_type   TEXT    DEFAULT 'Local',
  unit_price      NUMERIC NOT NULL DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'SGD'
                  CHECK (currency IN ('SGD','EUR','USD','CNY','JPY','INR','MYR')),
  stock_unit_price NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pr_items_pr_id ON pr_items(pr_id);

-- A11. PR Approval log
CREATE TABLE IF NOT EXISTS pr_approvals (
  id          SERIAL PRIMARY KEY,
  pr_id       INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  action      TEXT    NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor       TEXT,
  actor_role  TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- A12. Purchase Orders  (includes ALL delivery stages — BUY + STOCK)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               SERIAL PRIMARY KEY,
  po_no            TEXT   NOT NULL UNIQUE,
  job_no           TEXT   NOT NULL,
  pr_id            INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
  pr_no            TEXT,
  project_name     TEXT,
  po_type          TEXT   NOT NULL DEFAULT 'BUY' CHECK (po_type IN ('BUY','STOCK')),
  source_location  TEXT,
  supplier_id      INTEGER REFERENCES po_suppliers(id) ON DELETE SET NULL,
  supplier_name    TEXT,
  supplier_type    TEXT,
  requested_by     TEXT,
  prepared_by      TEXT,
  required_date    TEXT,
  delivery_method  TEXT,
  delivery_address TEXT,
  amount           NUMERIC NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  delivery_stage   TEXT
                   CHECK (delivery_stage IN (
                     'WITH_VENDOR','SHIPPED','ARRIVED_HUB','RECEIVED_FACTORY',
                     'PENDING_ISSUE','READY_COLLECT','COLLECTED'
                   )),
  goods_received_date DATE,
  received_by      TEXT,
  received_notes   TEXT,
  po_date          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_status  ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_job_no  ON purchase_orders(job_no);
CREATE INDEX IF NOT EXISTS idx_po_pr_id   ON purchase_orders(pr_id);

-- A13. PO Line Items
CREATE TABLE IF NOT EXISTS po_items (
  id           SERIAL PRIMARY KEY,
  po_id        INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no      INTEGER NOT NULL DEFAULT 1,
  profile_code TEXT,
  description  TEXT    NOT NULL,
  qty          NUMERIC NOT NULL DEFAULT 0,
  unit         TEXT    NOT NULL DEFAULT 'pcs',
  unit_price   NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON po_items(po_id);

-- A14. PO Approval log
CREATE TABLE IF NOT EXISTS po_approvals (
  id          SERIAL PRIMARY KEY,
  po_id       INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  action      TEXT    NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor       TEXT,
  actor_role  TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- A15. PO Delivery Tracking (lead times, freight details)
CREATE TABLE IF NOT EXISTS po_delivery_tracking (
  id                        SERIAL PRIMARY KEY,
  po_id                     INTEGER NOT NULL UNIQUE REFERENCES purchase_orders(id) ON DELETE CASCADE,
  fabrication_lead_days     INTEGER,
  powder_coating_lead_days  INTEGER,
  shipment_etd              DATE,
  shipment_eta              DATE,
  freight_forwarder         TEXT,
  freight_collect_date      DATE,
  freight_total_cost        NUMERIC,
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- A16. FIC reduce-stock function
CREATE OR REPLACE FUNCTION fn_fic_reduce_stock(p_item_id INTEGER, p_actor TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_item    pr_items%ROWTYPE;
  v_inv     inventory%ROWTYPE;
  v_move_id INTEGER;
BEGIN
  SELECT * INTO v_item FROM pr_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR item not found'; END IF;
  IF v_item.stock_status = 'STOCK_REDUCED' THEN RAISE EXCEPTION 'Stock already reduced for this item'; END IF;
  IF v_item.stock_qty <= 0 THEN RAISE EXCEPTION 'No from-stock quantity on this item'; END IF;

  SELECT * INTO v_inv FROM inventory WHERE id = v_item.inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF v_inv.quantity_in_stock < v_item.stock_qty THEN
    RAISE EXCEPTION 'Not enough stock — available: %, needed: %', v_inv.quantity_in_stock, v_item.stock_qty;
  END IF;

  UPDATE inventory SET quantity_in_stock = quantity_in_stock - v_item.stock_qty WHERE id = v_inv.id;
  UPDATE pr_items SET stock_status = 'STOCK_REDUCED' WHERE id = p_item_id;

  INSERT INTO stock_movements (inventory_id, item_code, movement_type, quantity_moved,
                               reference_type, reference_number, notes, moved_by,
                               stock_before, stock_after)
  VALUES (v_inv.id, v_inv.item_code, 'OUT', v_item.stock_qty,
          'PR', (SELECT pr_no FROM purchase_requests WHERE id = v_item.pr_id),
          'Issued to project by ' || p_actor, p_actor,
          v_inv.quantity_in_stock, v_inv.quantity_in_stock - v_item.stock_qty)
  RETURNING id INTO v_move_id;

  RETURN v_move_id;
END; $$;


-- ════════════════════════════════════════════════════════════
-- BLOCK B — SAFE COLUMN ADDITIONS (for tables that exist)
-- ════════════════════════════════════════════════════════════

-- B1. Add 'address' to po_suppliers if missing
ALTER TABLE po_suppliers ADD COLUMN IF NOT EXISTS address TEXT;

-- B2. Update delivery_stage CHECK on purchase_orders to include STOCK stages
--     (drop the old constraint by its auto-generated name, add new one)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE  conrelid = 'purchase_orders'::regclass
    AND    contype  = 'c'
    AND    conname  LIKE '%delivery_stage%'
  LOOP
    EXECUTE 'ALTER TABLE purchase_orders DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_delivery_stage_check
  CHECK (delivery_stage IN (
    'WITH_VENDOR','SHIPPED','ARRIVED_HUB','RECEIVED_FACTORY',
    'PENDING_ISSUE','READY_COLLECT','COLLECTED'
  ));


-- ════════════════════════════════════════════════════════════
-- BLOCK C — NEW TABLES FROM RECENT SESSION
-- (Definitely missing — created in this dev session)
-- ════════════════════════════════════════════════════════════

-- C1. PR file attachments (uploaded on the PR create / view form)
CREATE TABLE IF NOT EXISTS pr_attachments (
  id            SERIAL PRIMARY KEY,
  pr_id         INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,
  stored_name   TEXT    NOT NULL,
  file_path     TEXT    NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_attachments_pr_id ON pr_attachments(pr_id);

-- C2. Photos attached when receiving goods on a PO
CREATE TABLE IF NOT EXISTS po_receive_photos (
  id            SERIAL PRIMARY KEY,
  po_id         INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,
  stored_name   TEXT    NOT NULL,
  file_path     TEXT    NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_receive_photos_po_id ON po_receive_photos(po_id);

-- C3. Photos attached to an inventory item (via Edit modal)
CREATE TABLE IF NOT EXISTS inventory_item_photos (
  id             SERIAL PRIMARY KEY,
  inventory_id   INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  original_name  TEXT    NOT NULL,
  stored_name    TEXT    NOT NULL,
  file_path      TEXT    NOT NULL,
  mime_type      TEXT,
  size_bytes     BIGINT,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_photos_inventory_id ON inventory_item_photos(inventory_id);


-- ════════════════════════════════════════════════════════════
-- VERIFY — run this at the end to confirm everything exists
-- ════════════════════════════════════════════════════════════
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
ORDER  BY table_name;
