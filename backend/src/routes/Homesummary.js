// src/routes/homeSummary.js
// Summary counts for the HomePage cards.
//   GET /api/home/procurement-summary -> { open_prs, open_pos }
//   GET /api/home/operation-summary   -> { completed, in_progress, upcoming }
// Mount in index.js:  app.use("/api/home", require("./routes/homeSummary"));
const express = require("express");
const db = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();
const ok = (res, data) => res.json({ success: true, data });
const fail = (res, code, error) => res.status(code).json({ success: false, error });

// ── Procurement card: open PRs + open POs ──
router.get("/procurement-summary", protect, async (_req, res) => {
  try {
    const prs = await db.query(
      "SELECT COUNT(*)::int AS open_prs FROM purchase_requests WHERE status = 'PENDING'"
    );
    const pos = await db.query(
      "SELECT COUNT(*)::int AS open_pos FROM purchase_orders WHERE status = 'OPEN'"
    );
    ok(res, { open_prs: prs.rows[0].open_prs, open_pos: pos.rows[0].open_pos });
  } catch (e) { fail(res, 500, e.message); }
});

// ── Operation & Finance card: project status counts ──
router.get("/operation-summary", protect, async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Completed')::int        AS completed,
         COUNT(*) FILTER (WHERE status = 'In Progress')::int      AS in_progress,
         COUNT(*) FILTER (WHERE status = 'Upcoming Project')::int AS upcoming
       FROM projects`
    );
    ok(res, r.rows[0]);
  } catch (e) { fail(res, 500, e.message); }
});

module.exports = router;