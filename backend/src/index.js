const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const db = require("./config/db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// Security & Logging Middleware
// ============================================================
app.use(helmet());

// ── CORS: allow multiple origins via env (comma-separated) ──
// Set CORS_ORIGINS on Render, e.g.:
//   CORS_ORIGINS=https://your-app.vercel.app,http://localhost:5173
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CLIENT_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow non-browser tools (curl, Postman) with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(morgan("dev"));

// ============================================================
// Body Parser Middleware (IMPORTANT!)
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Routes
// ============================================================

// Auth Routes
app.use("/api/auth", require("./routes/auth"));

// Import Routes
const importRoutes = require("./routes/importExcel");
app.use("/api/import", importRoutes);

// Inventory Routes
const inventoryRoutes = require("./routes/inventory");
app.use("/api/inventory", inventoryRoutes);
app.use("/api/inventory", require("./routes/inventoryPhotos"));

// Users Routes
const userRoutes = require("./routes/users");
app.use("/api/auth/users", userRoutes);

// Permissions Routes
const permissionsRoutes = require("./routes/permissions");
app.use("/api/permissions", permissionsRoutes);

// ============================================================
// Projects Routes
// ============================================================
const projectsRoutes = require("./routes/projects");
app.use("/api/projects", projectsRoutes);
// PR / PO module
app.use("/api", require("./routes/poReference"));
app.use("/api/purchase-requests", require("./routes/purchaseRequests"));
app.use("/api/purchase-requests", require("./routes/prAttachments"));
app.use("/api/purchase-requests", require("./routes/prItemAttachments"));
app.use("/api/purchase-orders", require("./routes/purchaseOrders"));
app.use("/api/purchase-orders", require("./routes/poReceivePhotos"));
app.use("/api/pr-po-permissions", require("./routes/prPoPermissions"));
app.use("/api/purchase-orders", require("./routes/purchaseOrdersImport"));
app.use("/api/import", require("./routes/poImport"));
app.use("/api", require("./routes/poReference"));
app.use("/api", require("./routes/poDashboard"));
app.use("/api/auth", require("./routes/Passwordroutes"));
app.use("/api/home", require("./routes/Homesummary"));
app.use("/api/alerts", require("./routes/alerts"));
// ============================================================
// One-time Schema Migration Endpoint (delete after use)
// ============================================================
app.get("/api/run-migration-x9k2", async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  try {
    const schemaPath = path.join(__dirname, "../../full_schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");
    await db.query(sql);
    res.json({ status: "ok", message: "Schema applied successfully ✅" });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// ============================================================
// Startup: ensure module-access columns exist in pr_po_permissions
// ============================================================
db.query(`
  ALTER TABLE pr_po_permissions
    ADD COLUMN IF NOT EXISTS see_operation_finance BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS see_accounting        BOOLEAN NOT NULL DEFAULT true
`).catch((err) => console.error("Module-access column migration:", err.message));

// ============================================================
// Startup: schema for the SLA-alert engine (see utils/alertSla.js)
//  • po_notifications.target_user_id — lets an alert target the SPECIFIC owner
//    (drafter/purchaser) instead of a whole role.
//  • alert_ledger — records the last fire time per (rule, entity) so repeats
//    honour each rule's N-day cadence rather than re-sending every sweep.
// ============================================================
db.query(`
  ALTER TABLE po_notifications
    ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users(id) ON DELETE CASCADE
`).catch((err) => console.error("Notification target_user_id migration:", err.message));

// po_notifications.category — splits the feed into 🔔 Alerts ('alert') and
// 📬 Inbox ('message'). Default 'message' so writers that forget still land safely.
// (Was previously only in db_schema.sql, which isn't auto-run — causing
// "column category ... does not exist" on databases that never had it applied.)
db.query(`
  ALTER TABLE po_notifications
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'message'
`).catch((err) => console.error("Notification category migration:", err.message));
db.query(`
  CREATE INDEX IF NOT EXISTS idx_po_notifications_category
    ON po_notifications (category, id DESC)
`).catch((err) => console.error("Notification category index:", err.message));

// Audit trail: structured before→after detail for edits (see utils/auditTrail.js).
// Price fields inside `details` are redacted server-side per see_pr_price/see_po_price.
db.query(`ALTER TABLE pr_approvals ADD COLUMN IF NOT EXISTS details JSONB`)
  .catch((err) => console.error("pr_approvals.details migration:", err.message));
db.query(`ALTER TABLE po_approvals ADD COLUMN IF NOT EXISTS details JSONB`)
  .catch((err) => console.error("po_approvals.details migration:", err.message));

// Request for Quotation: a buy line is stamped when its supplier's RFQ is
// requested. Generating the Buy PO is gated on every buy line being stamped, so
// no PO is raised without a supplier quotation on file. NULL = not yet requested.
db.query(`ALTER TABLE pr_items ADD COLUMN IF NOT EXISTS quote_requested_at TIMESTAMPTZ`)
  .catch((err) => console.error("pr_items.quote_requested_at migration:", err.message));

// Supplier sub-lines (1a/1b/1c): one requested item can be routed to several
// suppliers, each for a different processing purpose (powder coating, polishing,
// anodising…). Sub-lines share the parent's line_no and are ordered by line_suffix
// ('' = the main item, 'a'/'b'/'c'… = each purpose). `purpose` is the free-text
// process label shown on the sub-line, RFQ and PO. Existing rows are all main
// items (line_suffix = '', purpose = NULL), so this is fully backward compatible.
db.query(`ALTER TABLE pr_items ADD COLUMN IF NOT EXISTS line_suffix TEXT NOT NULL DEFAULT ''`)
  .catch((err) => console.error("pr_items.line_suffix migration:", err.message));
db.query(`ALTER TABLE pr_items ADD COLUMN IF NOT EXISTS purpose TEXT`)
  .catch((err) => console.error("pr_items.purpose migration:", err.message));

// ── QS approval (enhancement #3): two gates ──
// Gate 1 (PR, sourcing): new PR statuses PENDING_QS_APPROVAL / QS_APPROVED sit
// between APPROVED and PO_RAISED, plus who/when/why columns. The status CHECK is
// dropped + re-added in one DO block so the two statements can't race.
db.query(`
  DO $$ BEGIN
    ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
    ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
      CHECK (status IN ('PENDING','APPROVED','SEND_BACK','REJECTED','PENDING_QS_APPROVAL','QS_APPROVED','PO_RAISED'));
  END $$;
`).catch((err) => console.error("purchase_requests QS status CHECK migration:", err.message));
db.query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS qs_approved_by TEXT`)
  .catch((err) => console.error("purchase_requests.qs_approved_by migration:", err.message));
db.query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS qs_approved_at TIMESTAMPTZ`)
  .catch((err) => console.error("purchase_requests.qs_approved_at migration:", err.message));
db.query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS qs_sent_back_reason TEXT`)
  .catch((err) => console.error("purchase_requests.qs_sent_back_reason migration:", err.message));

// Gate 2 (PO, price): a SEPARATE price-approval track on the PO, independent of the
// delivery_stage/status track — the two never gate each other; only Close checks both.
// AWAITING_PRICING → PENDING_QS_PRICE (on any price edit) → PRICE_APPROVED (QS).
db.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS price_status TEXT NOT NULL DEFAULT 'AWAITING_PRICING'`)
  .catch((err) => console.error("purchase_orders.price_status migration:", err.message));
db.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS price_approved_by TEXT`)
  .catch((err) => console.error("purchase_orders.price_approved_by migration:", err.message));
db.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS price_approved_at TIMESTAMPTZ`)
  .catch((err) => console.error("purchase_orders.price_approved_at migration:", err.message));
db.query(`
  DO $$ BEGIN
    ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_price_status_check;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_price_status_check
      CHECK (price_status IN ('AWAITING_PRICING','PENDING_QS_PRICE','PRICE_APPROVED'));
  END $$;
`).catch((err) => console.error("purchase_orders price_status CHECK migration:", err.message));

// New QS permission action (one action covers both gates).
db.query(`ALTER TABLE pr_po_permissions ADD COLUMN IF NOT EXISTS qs_approve BOOLEAN NOT NULL DEFAULT FALSE`)
  .catch((err) => console.error("pr_po_permissions.qs_approve migration:", err.message));

// GST 9% on local-supplier BUY POs (overseas suppliers and internal STOCK POs
// are excluded — a Stock PO is stamped supplier_type 'Local', hence the po_type
// check). Generated columns, so every PO write path stays correct with no app
// changes, gst_amount can never drift from amount, and adding the column
// backfills every existing PO in one shot. Gross = amount + gst_amount.
db.query(`
  ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS gst_rate NUMERIC NOT NULL GENERATED ALWAYS AS
      (CASE WHEN po_type = 'BUY' AND supplier_type = 'Local' THEN 0.09 ELSE 0 END) STORED
`).catch((err) => console.error("purchase_orders.gst_rate migration:", err.message));
db.query(`
  ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS gst_amount NUMERIC NOT NULL GENERATED ALWAYS AS
      (CASE WHEN po_type = 'BUY' AND supplier_type = 'Local'
            THEN ROUND(amount * 0.09, 2) ELSE 0 END) STORED
`).catch((err) => console.error("purchase_orders.gst_amount migration:", err.message));

// Delivery/site location, copied from the originating PR when the PO is raised
// so the supplier and the yard both see where the goods are needed. POs created
// before this (and Excel imports, which carry no PR) stay NULL and render "—".
db.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS location TEXT`)
  .catch((err) => console.error("purchase_orders.location migration:", err.message));

db.query(`
  CREATE TABLE IF NOT EXISTS alert_ledger (
    rule          TEXT        NOT NULL,
    entity_type   TEXT        NOT NULL,          -- 'PR' | 'PO'
    entity_id     INTEGER     NOT NULL,
    last_fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fire_count    INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (rule, entity_type, entity_id)
  )
`).catch((err) => console.error("alert_ledger migration:", err.message));

// ============================================================
// Health Check Endpoint
// ============================================================
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      message: "InventoryOpz API running",
      database: "connected ✅",
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: "/api/auth",
        import: "/api/import",
        inventory: "/api/inventory",
        users: "/api/auth/users",
        permissions: "/api/permissions",
        projects: "/api/projects",
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      database: "disconnected ❌",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Error Handler
// ============================================================
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : {},
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Scheduler: SLA-breach sweep (twice daily by default)
//   Runs in-process via node-cron. The alert_ledger enforces each rule's
//   N-day repeat cadence, so the tick only needs to be frequent enough to
//   catch breaches promptly — 08:00 & 20:00 keeps alerts at humane times.
//   Override the schedule with ALERT_SWEEP_CRON, the zone with ALERT_TZ, or
//   disable entirely with ALERTS_ENABLED=false (e.g. to drive it from an
//   external cron hitting POST /api/alerts/run-sweep instead).
// ============================================================
if (process.env.ALERTS_ENABLED !== "false") {
  const cron = require("node-cron");
  const { runSlaSweep } = require("./utils/alertSla");
  const schedule = process.env.ALERT_SWEEP_CRON || "0 8,20 * * *";
  const timezone = process.env.ALERT_TZ || "Asia/Singapore";
  if (cron.validate(schedule)) {
    cron.schedule(schedule, () => { runSlaSweep().catch((e) => console.error("[alertSla] sweep error:", e.message)); },
      { timezone });
    console.log(`⏰ SLA alert sweep scheduled: "${schedule}" (${timezone})`);
  } else {
    console.error(`[alertSla] invalid ALERT_SWEEP_CRON "${schedule}" — sweep NOT scheduled`);
  }
}

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 InventoryOpz Backend Server Started");
  console.log("=".repeat(60));
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log("=".repeat(60) + "\n");
});

module.exports = app;
