// src/routes/poDashboard.js
// Dashboard stats for the PR/PO module: per-project PR/PO counts (matched by job_no)
// plus overall totals. All live from the database. Read-only.
// Mount in index.js:  app.use("/api", require("./routes/poDashboard"));
// Uses your existing db (../config/db) and auth (../middleware/auth).
const express = require("express");
const db = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();
const ok = (res, data, extra = {}) =>
  res.json({ success: true, data, ...extra });
const fail = (res, code, error) =>
  res.status(code).json({ success: false, error });

// ── DASHBOARD STATS — per-project PR/PO counts + overall ──
router.get("/dashboard-stats", protect, async (_req, res) => {
  try {
    // per-project PR counts
    const prByJob = await db.query(
      `SELECT job_no,
              COUNT(*)::int AS pr_count,
              COUNT(*) FILTER (WHERE status = 'PENDING')::int  AS pr_pending,
              COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS pr_approved,
              COUNT(*) FILTER (WHERE status IN ('REJECTED','SEND_BACK'))::int AS pr_rejected
       FROM purchase_requests GROUP BY job_no`,
    );
    // per-project PO counts + value, split net / GST / gross (gst_amount is a
    // generated column: 9% on local BUY POs only). po_value stays = gross.
    const poByJob = await db.query(
      `SELECT job_no,
              COUNT(*)::int AS po_count,
              COUNT(*) FILTER (WHERE status = 'OPEN')::int   AS po_open,
              COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS po_closed,
              COALESCE(SUM(amount),0)::numeric                AS po_net,
              COALESCE(SUM(gst_amount),0)::numeric            AS po_gst,
              COALESCE(SUM(amount + gst_amount),0)::numeric   AS po_value
       FROM purchase_orders GROUP BY job_no`,
    );

    // merge into a map keyed by job_no
    const byJob = {};
    for (const r of prByJob.rows) {
      byJob[r.job_no] = {
        job_no: r.job_no,
        pr_count: r.pr_count,
        pr_pending: r.pr_pending,
        pr_approved: r.pr_approved,
        pr_rejected: r.pr_rejected,
        po_count: 0,
        po_open: 0,
        po_closed: 0,
        po_net: 0,
        po_gst: 0,
        po_value: 0,
      };
    }
    for (const r of poByJob.rows) {
      const e = (byJob[r.job_no] ||= {
        job_no: r.job_no,
        pr_count: 0,
        pr_pending: 0,
        pr_approved: 0,
        pr_rejected: 0,
        po_count: 0,
        po_open: 0,
        po_closed: 0,
        po_net: 0,
        po_gst: 0,
        po_value: 0,
      });
      e.po_count = r.po_count;
      e.po_open = r.po_open;
      e.po_closed = r.po_closed;
      e.po_net = Number(r.po_net);
      e.po_gst = Number(r.po_gst);
      e.po_value = Number(r.po_value);
    }

    // overall totals
    const totals = {
      pr_total: prByJob.rows.reduce((a, r) => a + r.pr_count, 0),
      pr_pending: prByJob.rows.reduce((a, r) => a + r.pr_pending, 0),
      pr_approved: prByJob.rows.reduce((a, r) => a + r.pr_approved, 0),
      pr_rejected: prByJob.rows.reduce((a, r) => a + r.pr_rejected, 0),
      po_total: poByJob.rows.reduce((a, r) => a + r.po_count, 0),
      po_open: poByJob.rows.reduce((a, r) => a + r.po_open, 0),
      po_closed: poByJob.rows.reduce((a, r) => a + r.po_closed, 0),
      po_net: poByJob.rows.reduce((a, r) => a + Number(r.po_net), 0),
      po_gst: poByJob.rows.reduce((a, r) => a + Number(r.po_gst), 0),
      po_value: poByJob.rows.reduce((a, r) => a + Number(r.po_value), 0),
    };

    ok(res, { by_job: byJob, totals });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ── PROJECT DETAIL — one project's PRs and POs (for click-to-view panel) ──
router.get("/dashboard-stats/:jobNo", protect, async (req, res) => {
  try {
    const jobNo = req.params.jobNo;
    const proj = await db.query(
      "SELECT job_no, project_name, location FROM po_projects WHERE job_no = $1",
      [jobNo],
    );

    const prs = await db.query(
      `SELECT pr_no, project_name, requested_by, status, date_issued, created_at
       FROM purchase_requests WHERE job_no = $1 ORDER BY created_at DESC`,
      [jobNo],
    );
    // amount stays NET; gst_amount/gst_rate travel with it so the UI can show
    // the net / GST / gross split without recalculating anything.
    const pos = await db.query(
      `SELECT po_no, pr_no, po_type, supplier_name, source_location, status,
              COALESCE(amount,0)::numeric AS amount,
              COALESCE(gst_amount,0)::numeric AS gst_amount, gst_rate,
              delivery_stage, goods_received_date, created_at
       FROM purchase_orders WHERE job_no = $1 ORDER BY created_at DESC`,
      [jobNo],
    );

    ok(res, {
      project: proj.rows[0] || { job_no: jobNo, project_name: jobNo },
      prs: prs.rows,
      pos: pos.rows.map((p) => ({ ...p, amount: Number(p.amount), gst_amount: Number(p.gst_amount) })),
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ── QUICK VIEW dropdown options (projects, PRs, POs, suppliers) ──
router.get("/dashboard-options", protect, async (_req, res) => {
  try {
    const [projects, prs, pos, suppliers] = await Promise.all([
      db.query("SELECT job_no, project_name FROM po_projects ORDER BY job_no"),
      db.query(
        "SELECT pr_no, project_name, job_no FROM purchase_requests ORDER BY created_at DESC",
      ),
      db.query(
        "SELECT po_no, po_type, supplier_name, job_no FROM purchase_orders ORDER BY created_at DESC",
      ),
      db.query(
        "SELECT DISTINCT supplier_name FROM purchase_orders WHERE supplier_name IS NOT NULL ORDER BY supplier_name",
      ),
    ]);
    ok(res, {
      projects: projects.rows,
      prs: prs.rows,
      pos: pos.rows,
      suppliers: suppliers.rows.map((r) => r.supplier_name),
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ── DASHBOARD LISTS — full PR list, PO list, and supplier cards (with stats) ──
router.get("/dashboard-lists", protect, async (_req, res) => {
  try {
    const prs = await db.query(
      `SELECT pr.pr_no, pr.job_no, pr.project_name, pr.requested_by, pr.status,
              pr.date_issued, pr.created_at,
              (SELECT COUNT(*) FROM pr_items i WHERE i.pr_id = pr.id)::int AS item_count
       FROM purchase_requests pr ORDER BY pr.created_at DESC`,
    );
    const pos = await db.query(
      `SELECT po_no, pr_no, job_no, project_name, po_type, supplier_name, source_location,
              status, COALESCE(amount,0)::numeric AS amount,
              COALESCE(gst_amount,0)::numeric AS gst_amount, gst_rate,
              created_at, goods_received_date
       FROM purchase_orders ORDER BY created_at DESC`,
    );
    // supplier stats: how many POs, how many open, value split net / GST / gross
    const suppliers = await db.query(
      `SELECT supplier_name,
              COUNT(*)::int AS po_count,
              COUNT(*) FILTER (WHERE status = 'OPEN')::int AS po_open,
              COALESCE(SUM(amount),0)::numeric              AS po_net,
              COALESCE(SUM(gst_amount),0)::numeric          AS po_gst,
              COALESCE(SUM(amount + gst_amount),0)::numeric AS po_value,
              MAX(supplier_type) AS supplier_type
       FROM purchase_orders
       WHERE supplier_name IS NOT NULL
       GROUP BY supplier_name ORDER BY supplier_name`,
    );
    ok(res, {
      prs: prs.rows,
      pos: pos.rows.map((p) => ({ ...p, amount: Number(p.amount), gst_amount: Number(p.gst_amount) })),
      suppliers: suppliers.rows.map((s) => ({
        supplier_name: s.supplier_name,
        po_count: s.po_count,
        po_open: s.po_open,
        po_net: Number(s.po_net),
        po_gst: Number(s.po_gst),
        po_value: Number(s.po_value),
        supplier_type: s.supplier_type || "Local",
      })),
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ── Single PR detail (for Quick View PR dropdown) ──
router.get("/dashboard-pr/:prNo", protect, async (req, res) => {
  try {
    const pr = await db.query(
      "SELECT * FROM purchase_requests WHERE pr_no = $1",
      [req.params.prNo],
    );
    if (!pr.rows[0]) return fail(res, 404, "PR not found");
    const items = await db.query(
      "SELECT * FROM pr_items WHERE pr_id = $1 ORDER BY line_no, id",
      [pr.rows[0].id],
    );
    ok(res, { pr: pr.rows[0], items: items.rows });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ── Single PO detail (for Quick View PO dropdown) ──
router.get("/dashboard-po/:poNo", protect, async (req, res) => {
  try {
    const po = await db.query(
      "SELECT * FROM purchase_orders WHERE po_no = $1",
      [req.params.poNo],
    );
    if (!po.rows[0]) return fail(res, 404, "PO not found");
    const items = await db.query(
      "SELECT * FROM po_items WHERE po_id = $1 ORDER BY line_no, id",
      [po.rows[0].id],
    );
    ok(res, { po: po.rows[0], items: items.rows });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ── Supplier's POs (for Quick View Supplier dropdown) ──
router.get("/dashboard-supplier/:name", protect, async (req, res) => {
  try {
    const pos = await db.query(
      `SELECT po_no, pr_no, job_no, po_type, status, COALESCE(amount,0)::numeric AS amount,
              COALESCE(gst_amount,0)::numeric AS gst_amount, gst_rate, po_date
       FROM purchase_orders WHERE supplier_name = $1 ORDER BY created_at DESC`,
      [req.params.name],
    );
    ok(res, {
      supplier_name: req.params.name,
      pos: pos.rows.map((p) => ({ ...p, amount: Number(p.amount), gst_amount: Number(p.gst_amount) })),
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

module.exports = router;
