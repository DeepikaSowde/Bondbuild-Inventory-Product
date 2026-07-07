// src/routes/alerts.js
// On-demand trigger for the SLA-breach sweep (normally runs on a schedule via
// node-cron in index.js). Handy for testing and for wiring an EXTERNAL cron
// (Render Cron / GitHub Actions / cron-job.org) later instead of the in-process
// scheduler — point it at POST /api/alerts/run-sweep.
const express = require("express");
const { protect, roles } = require("../middleware/auth");
const { runSlaSweep } = require("../utils/alertSla");

const router = express.Router();

// Admin-only so it can't be spammed. `force=true` bypasses the advisory lock.
router.post("/run-sweep", protect, roles("Admin"), async (req, res) => {
  const result = await runSlaSweep({ force: req.query.force === "true" });
  res.json({ success: true, data: result });
});

module.exports = router;
